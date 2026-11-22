export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlExecutor {
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  all<T = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  first<T = Row>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
}

export interface SqlDriver extends SqlExecutor {
  /** Run `fn` atomically. All statements inside must go through the provided executor. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/**
 * Wrap a raw, single-connection executor so that
 *  - every top-level call and every transaction runs strictly one after another (no interleaving on the
 *    shared connection, so a transaction can never swallow unrelated statements), and
 *  - transactions are real BEGIN IMMEDIATE / COMMIT / ROLLBACK blocks.
 *
 * Exclusive transactions of expo-sqlite open a *second* connection, which would not carry the SQLCipher key,
 * so serialization is done here instead.
 */
export function createSerializedDriver(raw: SqlExecutor): SqlDriver {
  let tail: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };

  return {
    run: (sql, params) => enqueue(() => raw.run(sql, params)),
    all: (sql, params) => enqueue(() => raw.all(sql, params)),
    first: (sql, params) => enqueue(() => raw.first(sql, params)),
    exec: (sql) => enqueue(() => raw.exec(sql)),
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) =>
      enqueue(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(raw);
          await raw.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            /* the original error is the one worth reporting */
          }
          throw error;
        }
      }),
  };
}
