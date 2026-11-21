import { TRANSFER_CATEGORY_KEY } from '@spentsmart/finance/categories';
import { BudgetStatus, budgetStatus, rolloverFrom } from '@spentsmart/finance/ledger';
import { isValidPaise } from '@spentsmart/finance/money';
import { Range, periodRanges } from '@spentsmart/finance/periods';
import { Budget } from '@spentsmart/finance/types';
import { SqlDriver, SqlExecutor } from '../driver';
import { RepoDeps } from './deps';
import { ValidationError } from './transactions';

interface BudgetRow {
  id: string;
  category_key: string | null;
  limit_paise: number;
  rollover: number;
}

const mapBudget = (r: BudgetRow): Budget => ({
  id: r.id,
  categoryKey: r.category_key,
  limitPaise: r.limit_paise,
  rollover: r.rollover === 1,
});

export interface BudgetWithStatus extends Budget {
  status: BudgetStatus;
}

/** Spending (expenses minus refunds) in a range, for one category or for everything. */
export async function spendingIn(db: SqlExecutor, range: Range, categoryKey: string | null): Promise<number> {
  const row = await db.first<{ s: number | null }>(
    `SELECT SUM(CASE type WHEN 'expense' THEN amount_paise WHEN 'refund' THEN -amount_paise ELSE 0 END) AS s
     FROM transactions
     WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?
       ${categoryKey === null ? '' : 'AND category_key = ?'}`,
    categoryKey === null ? [range.start, range.end] : [range.start, range.end, categoryKey],
  );
  return row?.s ?? 0;
}

export function createBudgetsRepo(db: SqlDriver, deps: RepoDeps) {
  const { now, newId, notify } = deps;

  async function listActive(): Promise<Budget[]> {
    const rows = await db.all<BudgetRow>(
      'SELECT id, category_key, limit_paise, rollover FROM budgets WHERE archived_at IS NULL ORDER BY category_key IS NOT NULL, category_key',
    );
    return rows.map(mapBudget);
  }

  return {
    listActive,

    /** Create or replace the active budget for a category (or the overall budget when `categoryKey` is null). */
    async set(categoryKey: string | null, limitPaise: number, rollover = false): Promise<Budget> {
      if (!isValidPaise(limitPaise)) throw new ValidationError('Enter a budget greater than zero.');
      if (categoryKey === TRANSFER_CATEGORY_KEY) throw new ValidationError('Transfers cannot have a budget.');
      const id = newId();
      await db.transaction(async (tx) => {
        await tx.run('UPDATE budgets SET archived_at = ? WHERE archived_at IS NULL AND COALESCE(category_key, \'\') = ?', [
          now(),
          categoryKey ?? '',
        ]);
        await tx.run('INSERT INTO budgets (id, category_key, limit_paise, rollover, created_at) VALUES (?, ?, ?, ?, ?)', [
          id,
          categoryKey,
          limitPaise,
          rollover ? 1 : 0,
          now(),
        ]);
      });
      notify();
      return { id, categoryKey, limitPaise, rollover };
    },

    async remove(categoryKey: string | null): Promise<boolean> {
      const result = await db.run(
        'UPDATE budgets SET archived_at = ? WHERE archived_at IS NULL AND COALESCE(category_key, \'\') = ?',
        [now(), categoryKey ?? ''],
      );
      if (result.changes > 0) notify();
      return result.changes > 0;
    },

    /**
     * Status of every active budget for the current month. Rollover carries last month's unused amount, using the
     * current limit for last month too (limit history is not kept).
     */
    async statuses(at: Date = new Date(now())): Promise<BudgetWithStatus[]> {
      const { current, previous } = periodRanges('month', at);
      const budgets = await listActive();
      const out: BudgetWithStatus[] = [];
      for (const b of budgets) {
        const spent = await spendingIn(db, current, b.categoryKey);
        const carried = b.rollover ? rolloverFrom(b.limitPaise, await spendingIn(db, previous, b.categoryKey)) : 0;
        out.push({ ...b, status: budgetStatus({ limitPaise: b.limitPaise, spentPaise: spent, carriedPaise: carried, period: current, now: at.getTime() }) });
      }
      return out;
    },
  };
}

export type BudgetsRepo = ReturnType<typeof createBudgetsRepo>;
