import { SqlDriver } from '../driver';
import { createAccountsRepo } from './accounts';
import { createAnalyticsRepo } from './analytics';
import { createAttemptsRepo } from './attempts';
import { createBudgetsRepo } from './budgets';
import { createCategoriesRepo } from './categories';
import { RepoDeps } from './deps';
import { createGoalsRepo } from './goals';
import { createSettingsRepo } from './settings';
import { createTransactionsRepo } from './transactions';

export type { RepoDeps } from './deps';

export function createRepositories(db: SqlDriver, deps: RepoDeps) {
  return {
    /** The underlying driver, for services that work across tables (sync). */
    driver: db,
    transactions: createTransactionsRepo(db, deps),
    categories: createCategoriesRepo(db, deps),
    attempts: createAttemptsRepo(db, deps),
    settings: createSettingsRepo(db, deps),
    analytics: createAnalyticsRepo(db),
    accounts: createAccountsRepo(db, deps),
    budgets: createBudgetsRepo(db, deps),
    goals: createGoalsRepo(db, deps),

    /** Facts shown on the Privacy Dashboard. */
    async storageStats(): Promise<{ bytes: number; transactions: number; categories: number; oldest: number | null; newest: number | null }> {
      const [pages, size, range, cats] = await Promise.all([
        db.first<{ page_count: number }>('PRAGMA page_count'),
        db.first<{ page_size: number }>('PRAGMA page_size'),
        db.first<{ c: number; oldest: number | null; newest: number | null }>(
          'SELECT COUNT(*) AS c, MIN(occurred_at) AS oldest, MAX(occurred_at) AS newest FROM transactions WHERE deleted_at IS NULL',
        ),
        db.first<{ c: number }>('SELECT COUNT(*) AS c FROM categories'),
      ]);
      return {
        bytes: (pages?.page_count ?? 0) * (size?.page_size ?? 0),
        transactions: range?.c ?? 0,
        categories: cats?.c ?? 0,
        oldest: range?.oldest ?? null,
        newest: range?.newest ?? null,
      };
    },

    /** Wipe everything the app has stored and restore the defaults. Used by "Delete all data". */
    async eraseEverything(): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM transaction_tags');
        await tx.run('DELETE FROM transaction_revisions');
        await tx.run('DELETE FROM transactions');
        await tx.run('DELETE FROM payment_attempts');
        await tx.run('DELETE FROM budgets');
        await tx.run('DELETE FROM goals');
        await tx.run('DELETE FROM settings');
      });
      await createCategoriesRepo(db, deps).resetToDefaults();
      await createAccountsRepo(db, deps).resetToDefaults();
      // A wiped phone starts over with sync too; the deletes above must not reach the server as tombstones.
      await db.transaction(async (tx) => {
        for (const table of ['sync_outbox', 'sync_records', 'sync_conflicts', 'sync_meta']) await tx.run(`DELETE FROM ${table}`);
      });
      deps.notify();
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
