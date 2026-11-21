import { SqlDriver, SqlExecutor } from './driver';

/** The categories v1 shipped with. Frozen: a released migration must keep producing exactly this. */
const V1_DEFAULT_CATEGORIES = [
  { key: 'food', label: 'Food', icon: 'restaurant', color: '#F59E0B', sortOrder: 0, isSystem: false },
  { key: 'utility', label: 'Utility', icon: 'flash', color: '#3B82F6', sortOrder: 1, isSystem: false },
  { key: 'college', label: 'College', icon: 'school', color: '#8B5CF6', sortOrder: 2, isSystem: false },
  { key: 'rent', label: 'Rent', icon: 'home', color: '#EC4899', sortOrder: 3, isSystem: false },
  { key: 'income', label: 'Income', icon: 'wallet', color: '#10B981', sortOrder: 4, isSystem: true },
  { key: 'other', label: 'Other', icon: 'pricetag', color: '#6B7280', sortOrder: 5, isSystem: true },
] as const;

export const DEFAULT_BANK_ACCOUNT_ID = 'default-bank';
export const DEFAULT_CASH_ACCOUNT_ID = 'default-cash';

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

      for (const c of V1_DEFAULT_CATEGORIES) {
        await tx.run(
          'INSERT INTO categories (key, label, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?)',
          [c.key, c.label, c.icon, c.color, c.sortOrder, c.isSystem ? 1 : 0],
        );
      }
    },
  },
  {
    version: 2,
    async up(tx) {
      const nowSql = "CAST(strftime('%s', 'now') AS INTEGER) * 1000";

      await tx.exec(`
        CREATE TABLE accounts (
          id                    TEXT PRIMARY KEY NOT NULL,
          name                  TEXT NOT NULL,
          type                  TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'wallet', 'credit')),
          opening_balance_paise INTEGER NOT NULL DEFAULT 0,
          sort_order            INTEGER NOT NULL DEFAULT 0,
          created_at            INTEGER NOT NULL,
          archived_at           INTEGER
        );
        INSERT INTO accounts (id, name, type, sort_order, created_at) VALUES
          ('${DEFAULT_BANK_ACCOUNT_ID}', 'Bank & UPI', 'bank', 0, ${nowSql}),
          ('${DEFAULT_CASH_ACCOUNT_ID}', 'Cash', 'cash', 1, ${nowSql});

        CREATE TABLE transactions_v2 (
          id             TEXT PRIMARY KEY NOT NULL,
          amount_paise   INTEGER NOT NULL CHECK (amount_paise > 0),
          type           TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'refund')),
          category_key   TEXT NOT NULL,
          payee_name     TEXT NOT NULL,
          payee_vpa      TEXT,
          payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'cash', 'bank', 'other')),
          note           TEXT,
          occurred_at    INTEGER NOT NULL,
          created_at     INTEGER NOT NULL,
          updated_at     INTEGER NOT NULL,
          deleted_at     INTEGER,
          verified_by    TEXT NOT NULL CHECK (verified_by IN ('upi_result', 'user', 'manual')),
          upi_txn_id     TEXT,
          upi_txn_ref    TEXT,
          attempt_id     TEXT UNIQUE,
          account_id     TEXT NOT NULL REFERENCES accounts (id),
          source         TEXT NOT NULL CHECK (source IN ('manual', 'scan', 'quick_add', 'voice', 'ocr', 'import', 'ai')),
          version        INTEGER NOT NULL DEFAULT 1,
          transfer_id    TEXT,
          transfer_role  TEXT CHECK (transfer_role IN ('out', 'in')),
          CHECK ((type = 'transfer') = (transfer_id IS NOT NULL AND transfer_role IS NOT NULL))
        );

        INSERT INTO transactions_v2
          (id, amount_paise, type, category_key, payee_name, payee_vpa, payment_method, note, occurred_at, created_at,
           updated_at, deleted_at, verified_by, upi_txn_id, upi_txn_ref, attempt_id, account_id, source, version,
           transfer_id, transfer_role)
        SELECT id, amount_paise, type, category_key, payee_name, payee_vpa, payment_method, note, occurred_at, created_at,
               created_at, NULL, verified_by, upi_txn_id, upi_txn_ref, attempt_id,
               CASE payment_method WHEN 'cash' THEN '${DEFAULT_CASH_ACCOUNT_ID}' ELSE '${DEFAULT_BANK_ACCOUNT_ID}' END,
               CASE WHEN attempt_id IS NOT NULL THEN 'scan' ELSE 'manual' END,
               1, NULL, NULL
        FROM transactions;

        DROP TABLE transactions;
        ALTER TABLE transactions_v2 RENAME TO transactions;

        CREATE INDEX idx_tx_time      ON transactions (occurred_at DESC, id DESC) WHERE deleted_at IS NULL;
        CREATE INDEX idx_tx_cat_time  ON transactions (category_key, occurred_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX idx_tx_type_time ON transactions (type, occurred_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX idx_tx_account   ON transactions (account_id, occurred_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX idx_tx_transfer  ON transactions (transfer_id) WHERE transfer_id IS NOT NULL;

        CREATE TABLE transaction_tags (
          transaction_id TEXT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
          tag            TEXT NOT NULL,
          PRIMARY KEY (transaction_id, tag)
        );
        CREATE INDEX idx_tags_tag ON transaction_tags (tag);

        CREATE TABLE transaction_revisions (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT NOT NULL,
          version        INTEGER NOT NULL,
          snapshot       TEXT NOT NULL,
          changed_at     INTEGER NOT NULL
        );
        CREATE INDEX idx_revisions_tx ON transaction_revisions (transaction_id, version);

        CREATE TABLE budgets (
          id           TEXT PRIMARY KEY NOT NULL,
          category_key TEXT,
          limit_paise  INTEGER NOT NULL CHECK (limit_paise > 0),
          rollover     INTEGER NOT NULL DEFAULT 0,
          created_at   INTEGER NOT NULL,
          archived_at  INTEGER
        );
        CREATE UNIQUE INDEX idx_budget_active ON budgets (COALESCE(category_key, '')) WHERE archived_at IS NULL;

        INSERT INTO budgets (id, category_key, limit_paise, rollover, created_at)
        SELECT 'budget-overall', NULL, CAST(value AS INTEGER), 0, ${nowSql}
        FROM settings WHERE key = 'budgetPaise' AND CAST(value AS INTEGER) > 0;
        DELETE FROM settings WHERE key = 'budgetPaise';

        CREATE TABLE goals (
          id           TEXT PRIMARY KEY NOT NULL,
          name         TEXT NOT NULL,
          target_paise INTEGER NOT NULL CHECK (target_paise > 0),
          saved_paise  INTEGER NOT NULL DEFAULT 0 CHECK (saved_paise >= 0),
          deadline     INTEGER,
          created_at   INTEGER NOT NULL,
          archived_at  INTEGER
        );
      `);

      // A user category that happens to be called "transfer" moves aside for the system one.
      const clash = await tx.first<{ key: string }>("SELECT key FROM categories WHERE key = 'transfer'");
      if (clash) {
        await tx.run("UPDATE categories SET key = 'transfer-custom' WHERE key = 'transfer'");
        await tx.run("UPDATE transactions SET category_key = 'transfer-custom' WHERE category_key = 'transfer'");
        await tx.run("UPDATE payment_attempts SET category_key = 'transfer-custom' WHERE category_key = 'transfer'");
      }
      await tx.run(
        "INSERT INTO categories (key, label, icon, color, sort_order, is_system) VALUES ('transfer', 'Transfer', 'swap-horizontal', '#64748B', 99, 1)",
      );
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
