import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { RunResult, SqlDriver, SqlExecutor, SqlValue, createSerializedDriver } from '@/db/driver';
import { migrate } from '@/db/migrations';
import { RepoDeps, createRepositories } from '@/db/repositories';

/** In-memory SQLite (Node's built-in engine) behind the same driver interface the app uses on-device. */
export function createNodeExecutor(db: DatabaseSync): SqlExecutor {
  const bind = (params?: readonly SqlValue[]) => [...(params ?? [])];
  return {
    async run(sql, params): Promise<RunResult> {
      const r = db.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async all<T>(sql: string, params?: readonly SqlValue[]) {
      return db.prepare(sql).all(...bind(params)) as unknown as T[];
    },
    async first<T>(sql: string, params?: readonly SqlValue[]) {
      return (db.prepare(sql).get(...bind(params)) as unknown as T | undefined) ?? null;
    },
    async exec(sql) {
      db.exec(sql);
    },
  };
}

export function createNodeDriver(path = ':memory:'): { driver: SqlDriver; raw: DatabaseSync } {
  const raw = new DatabaseSync(path);
  return { driver: createSerializedDriver(createNodeExecutor(raw)), raw };
}

export interface TestContext {
  driver: SqlDriver;
  raw: DatabaseSync;
  repos: ReturnType<typeof createRepositories>;
  clock: { now: number };
  notifications: { count: number };
}

export async function createTestContext(startAt = Date.UTC(2026, 5, 17, 9, 0, 0)): Promise<TestContext> {
  const { driver, raw } = createNodeDriver();
  await migrate(driver);
  const clock = { now: startAt };
  const notifications = { count: 0 };
  const deps: RepoDeps = {
    now: () => clock.now,
    newId: () => randomUUID(),
    notify: () => {
      notifications.count++;
    },
  };
  return { driver, raw, repos: createRepositories(driver, deps), clock, notifications };
}
