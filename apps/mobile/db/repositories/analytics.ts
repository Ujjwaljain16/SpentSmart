import { Paise, percentOf } from '@spentsmart/finance/money';
import { Bucket, Period, Range, Trend, computeTrend, periodRanges } from '@spentsmart/finance/periods';
import { InsightTxn } from '@spentsmart/finance/insights/common';
import { SqlExecutor } from '../driver';

export interface PeriodTotals {
  incomePaise: Paise;
  expensePaise: Paise;
}

export interface CategoryShare {
  categoryKey: string;
  amountPaise: Paise;
  percent: number;
  count: number;
}

export interface PayeeTotal {
  name: string;
  vpa: string | null;
  amountPaise: Paise;
  count: number;
}

export interface PeriodInsights extends PeriodTotals {
  balancePaise: number;
  trend: Trend;
  categories: CategoryShare[];
  topPayees: PayeeTotal[];
}

export interface BucketTotal {
  label: string;
  amountPaise: Paise;
  start: number;
}

export interface CategoryComparison {
  currentPaise: Paise;
  previousPaise: Paise;
  trend: Trend;
}

export function createAnalyticsRepo(db: SqlExecutor) {
  async function totals(range: Range): Promise<PeriodTotals> {
    const rows = await db.all<{ type: string; s: number }>(
      `SELECT type, SUM(amount_paise) AS s FROM transactions
       WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ? GROUP BY type`,
      [range.start, range.end],
    );
    let incomePaise = 0;
    let expensePaise = 0;
    for (const r of rows) {
      // Spending is expenses minus refunds; transfers between own accounts are neither.
      if (r.type === 'income') incomePaise = r.s;
      else if (r.type === 'expense') expensePaise += r.s;
      else if (r.type === 'refund') expensePaise -= r.s;
    }
    return { incomePaise, expensePaise };
  }

  async function categoryTotal(categoryKey: string, range: Range): Promise<Paise> {
    const row = await db.first<{ s: number | null }>(
      `SELECT SUM(CASE type WHEN 'expense' THEN amount_paise WHEN 'refund' THEN -amount_paise ELSE 0 END) AS s FROM transactions
       WHERE deleted_at IS NULL AND category_key = ? AND occurred_at >= ? AND occurred_at < ?`,
      [categoryKey, range.start, range.end],
    );
    return row?.s ?? 0;
  }

  return {
    totals,
    categoryTotal,

    /** The columns the insight detectors read, for non-deleted rows in [since, until). */
    async insightRows(since: number, until: number): Promise<InsightTxn[]> {
      const rows = await db.all<{
        id: string;
        type: InsightTxn['type'];
        amount_paise: number;
        occurred_at: number;
        payee_name: string;
        payee_vpa: string | null;
        category_key: string;
      }>(
        `SELECT id, type, amount_paise, occurred_at, payee_name, payee_vpa, category_key FROM transactions
         WHERE deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at ASC`,
        [since, until],
      );
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        amountPaise: r.amount_paise,
        occurredAt: r.occurred_at,
        payeeName: r.payee_name,
        payeeVpa: r.payee_vpa,
        categoryKey: r.category_key,
      }));
    },

    async insights(period: Period, now: Date = new Date()): Promise<PeriodInsights> {
      const { current, previous } = periodRanges(period, now);
      const [cur, prev] = await Promise.all([totals(current), totals(previous)]);

      const catRows = await db.all<{ category_key: string; s: number; c: number }>(
        `SELECT category_key, SUM(CASE type WHEN 'expense' THEN amount_paise WHEN 'refund' THEN -amount_paise ELSE 0 END) AS s, SUM(type = 'expense') AS c FROM transactions
         WHERE deleted_at IS NULL AND type IN ('expense', 'refund') AND occurred_at >= ? AND occurred_at < ?
         GROUP BY category_key HAVING s > 0 ORDER BY s DESC`,
        [current.start, current.end],
      );
      const categories = catRows.map((r) => ({
        categoryKey: r.category_key,
        amountPaise: r.s,
        percent: percentOf(r.s, cur.expensePaise),
        count: r.c,
      }));

      const payeeRows = await db.all<{ name: string; vpa: string | null; s: number; c: number }>(
        `SELECT MAX(payee_name) AS name, MAX(payee_vpa) AS vpa, SUM(amount_paise) AS s, COUNT(*) AS c
         FROM transactions
         WHERE deleted_at IS NULL AND type = 'expense' AND occurred_at >= ? AND occurred_at < ?
         GROUP BY lower(payee_name) ORDER BY s DESC LIMIT 3`,
        [current.start, current.end],
      );

      return {
        ...cur,
        balancePaise: cur.incomePaise - cur.expensePaise,
        trend: computeTrend(cur.expensePaise, prev.expensePaise),
        categories,
        topPayees: payeeRows.map((r) => ({ name: r.name, vpa: r.vpa, amountPaise: r.s, count: r.c })),
      };
    },

    /** Expense totals per bucket, computed in a single indexed scan of the covered range. */
    async bucketTotals(buckets: readonly Bucket[]): Promise<BucketTotal[]> {
      if (buckets.length === 0) return [];
      const cases = buckets
        .map((_, i) => `COALESCE(SUM(CASE WHEN occurred_at >= ? AND occurred_at < ? THEN (CASE type WHEN 'refund' THEN -amount_paise ELSE amount_paise END) END), 0) AS b${i}`)
        .join(', ');
      const params = buckets.flatMap((b) => [b.start, b.end]);
      const min = Math.min(...buckets.map((b) => b.start));
      const max = Math.max(...buckets.map((b) => b.end));
      const row = await db.first<Record<string, number>>(
        `SELECT ${cases} FROM transactions WHERE deleted_at IS NULL AND type IN ('expense', 'refund') AND occurred_at >= ? AND occurred_at < ?`,
        [...params, min, max],
      );
      return buckets.map((b, i) => ({ label: b.label, start: b.start, amountPaise: row?.[`b${i}`] ?? 0 }));
    },

    /** This month vs last month for one category. */
    async categoryComparison(categoryKey: string, now: Date = new Date()): Promise<CategoryComparison> {
      const { current, previous } = periodRanges('month', now);
      const [currentPaise, previousPaise] = await Promise.all([
        categoryTotal(categoryKey, current),
        categoryTotal(categoryKey, previous),
      ]);
      return { currentPaise, previousPaise, trend: computeTrend(currentPaise, previousPaise) };
    },

    /** Lifetime expense total for a category (income categories report income). */
    async categoryLifetimeTotal(categoryKey: string): Promise<Paise> {
      const row = await db.first<{ s: number | null }>(
        "SELECT SUM(CASE type WHEN 'refund' THEN -amount_paise WHEN 'transfer' THEN 0 ELSE amount_paise END) AS s FROM transactions WHERE deleted_at IS NULL AND category_key = ?",
        [categoryKey],
      );
      return row?.s ?? 0;
    },
  };
}

export type AnalyticsRepo = ReturnType<typeof createAnalyticsRepo>;
