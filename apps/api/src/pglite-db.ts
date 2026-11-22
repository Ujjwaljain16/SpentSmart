import { PGlite } from '@electric-sql/pglite';
import { Db, Queryable } from './db';

/**
 * Postgres compiled to WebAssembly, in-process. Used by the tests and by `pnpm dev:local`, so the API runs on a laptop
 * without installing or starting a database. Not for production.
 */
export function pgliteDb(pg: PGlite): Db {
  // PGlite's query() takes one statement; migrations are several, so parameterless SQL goes through exec().
  const run = async <T>(target: PGlite | Parameters<Parameters<PGlite['transaction']>[0]>[0], sql: string, params?: unknown[]) => {
    if (params === undefined) {
      const results = await target.exec(sql);
      return { rows: (results.at(-1)?.rows ?? []) as T[] };
    }
    return { rows: (await target.query<T>(sql, params)).rows };
  };
  return {
    query: (sql, params) => run(pg, sql, params),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (sql, params) => run(tx, sql, params) } as Queryable)),
    close: () => pg.close(),
  };
}

/** `pglite:memory` or `pglite:<folder>`. */
export async function openPglite(url: string): Promise<Db> {
  const where = url.slice('pglite:'.length);
  return pgliteDb(where === 'memory' ? new PGlite() : new PGlite(where));
}
