import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** The database as the app sees it, implemented by node-postgres in production and PGlite in tests. */
export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function pgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 5, ssl: connectionString.includes('sslmode=') ? undefined : false });
  return {
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params)).rows as T[] }),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await client.query(sql, params)).rows as T[] }) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Run `fn` as the signed-in user: inside a transaction, as the row-level-security role, with `app.user_id` set.
 * Everything that reads or writes a user's data goes through here.
 */
export function asUser<T>(db: Db, userId: string, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    await tx.query('SET LOCAL ROLE spentsmart_app');
    return fn(tx);
  });
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Apply `migrations/NNN_*.sql` files in order, each once, each in its own transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
