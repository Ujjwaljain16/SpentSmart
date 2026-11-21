import { SqlDriver } from '../driver';
import { createAnalyticsRepo } from './analytics';
import { createAttemptsRepo } from './attempts';
import { createCategoriesRepo } from './categories';
import { RepoDeps } from './deps';
import { createSettingsRepo } from './settings';
import { createTransactionsRepo } from './transactions';

export type { RepoDeps } from './deps';

export function createRepositories(db: SqlDriver, deps: RepoDeps) {
  return {
    transactions: createTransactionsRepo(db, deps),
    categories: createCategoriesRepo(db, deps),
    attempts: createAttemptsRepo(db, deps),
    settings: createSettingsRepo(db, deps),
    analytics: createAnalyticsRepo(db),

    /** Facts shown on the Privacy Dashboard. */
    async storageStats(): Promise<{ bytes: number; transactions: number; categories: number; oldest: number | null; newest: number | null }> {
      const [pages, size, range, cats] = await Promise.all([
        db.first<{ page_count: number }>('PRAGMA page_count'),
        db.first<{ page_size: number }>('PRAGMA page_size'),
        db.first<{ c: number; oldest: number | null; newest: number | null }>(
          'SELECT COUNT(*) AS c, MIN(occurred_at) AS oldest, MAX(occurred_at) AS newest FROM transactions',
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
        await tx.run('DELETE FROM transactions');
        await tx.run('DELETE FROM payment_attempts');
        await tx.run('DELETE FROM settings');
      });
      await createCategoriesRepo(db, deps).resetToDefaults();
      deps.notify();
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
