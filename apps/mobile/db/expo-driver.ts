import type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
import { RunResult, SqlDriver, SqlExecutor, SqlValue, createSerializedDriver } from './driver';

/** Adapt an open expo-sqlite connection to the app's SqlExecutor interface. */
export function createExpoExecutor(db: SQLiteDatabase): SqlExecutor {
  const bind = (params?: readonly SqlValue[]): SQLiteBindValue[] => [...(params ?? [])];
  return {
    async run(sql, params): Promise<RunResult> {
      const r = await db.runAsync(sql, bind(params));
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T>(sql: string, params?: readonly SqlValue[]) => db.getAllAsync<T>(sql, bind(params)),
    first: <T>(sql: string, params?: readonly SqlValue[]) => db.getFirstAsync<T>(sql, bind(params)),
    exec: (sql) => db.execAsync(sql),
  };
}

export function createExpoDriver(db: SQLiteDatabase): SqlDriver {
  return createSerializedDriver(createExpoExecutor(db));
}
