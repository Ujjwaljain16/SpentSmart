import { DEFAULT_CATEGORIES } from '@/domain/categories';
import { SqlDriver, SqlExecutor } from './driver';

export interface Migration {
  version: number;
  up(tx: SqlExecutor): Promise<void>;
}

/**
 * Append-only list. Never edit a released migration; add a new one.
 * The schema version lives in `PRAGMA user_version`.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE categories (
          key        TEXT PRIMARY KEY NOT NULL,
          label      TEXT NOT NULL,
          icon       TEXT NOT NULL,
          color      TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_system  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE transactions (
          id             TEXT PRIMARY KEY NOT NULL,
          amount_paise   INTEGER NOT NULL CHECK (amount_paise > 0),
          type           TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          category_key   TEXT NOT NULL,
          payee_name     TEXT NOT NULL,
          payee_vpa      TEXT,
          payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'cash', 'bank', 'other')),
          note           TEXT,
          occurred_at    INTEGER NOT NULL,
          created_at     INTEGER NOT NULL,
          verified_by    TEXT NOT NULL CHECK (verified_by IN ('upi_result', 'user', 'manual')),
          upi_txn_id     TEXT,
          upi_txn_ref    TEXT,
          attempt_id     TEXT UNIQUE
        );
        CREATE INDEX idx_tx_time     ON transactions (occurred_at DESC, id DESC);
        CREATE INDEX idx_tx_cat_time ON transactions (category_key, occurred_at DESC);
        CREATE INDEX idx_tx_type_time ON transactions (type, occurred_at DESC);

        CREATE TABLE payment_attempts (
          id            TEXT PRIMARY KEY NOT NULL,
          vpa           TEXT NOT NULL,
          payee_name    TEXT NOT NULL,
          amount_paise  INTEGER,
          note          TEXT,
          category_key  TEXT NOT NULL,
          app_package   TEXT,
          txn_ref       TEXT,
          status        TEXT NOT NULL CHECK (status IN ('launched', 'needs_review', 'recorded', 'discarded', 'expired')),
          suggestion    TEXT CHECK (suggestion IN ('paid', 'not_paid', 'unsure')),
          response      TEXT,
          created_at    INTEGER NOT NULL,
          launched_at   INTEGER,
          returned_at   INTEGER,
          snoozed_until INTEGER
        );
        CREATE INDEX idx_attempt_status ON payment_attempts (status, created_at DESC);

        CREATE TABLE settings (
          key   TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);

      for (const c of DEFAULT_CATEGORIES) {
        await tx.run(
          'INSERT INTO categories (key, label, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?)',
          [c.key, c.label, c.icon, c.color, c.sortOrder, c.isSystem ? 1 : 0],
        );
      }
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export class SchemaTooNewError extends Error {
  constructor(public readonly found: number, public readonly supported: number) {
    super(`Database schema v${found} is newer than this app supports (v${supported}).`);
    this.name = 'SchemaTooNewError';
  }
}

/** Bring the database up to date. Each migration runs in its own transaction together with its version bump. */
export async function migrate(driver: SqlDriver, migrations: readonly Migration[] = MIGRATIONS): Promise<number> {
  const row = await driver.first<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  if (current > latest) throw new SchemaTooNewError(current, latest);

  for (const migration of migrations) {
    if (migration.version <= current) continue;
    await driver.transaction(async (tx) => {
      await migration.up(tx);
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
    });
    current = migration.version;
  }
  return current;
}
