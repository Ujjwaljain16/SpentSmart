import { Paise, percentOf } from '@/domain/money';
import { Bucket, Period, Range, Trend, computeTrend, periodRanges } from '@/domain/periods';
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
       WHERE occurred_at >= ? AND occurred_at < ? GROUP BY type`,
      [range.start, range.end],
    );
    let incomePaise = 0;
    let expensePaise = 0;
    for (const r of rows) {
      if (r.type === 'income') incomePaise = r.s;
      else expensePaise = r.s;
    }
    return { incomePaise, expensePaise };
  }

  async function categoryTotal(categoryKey: string, range: Range): Promise<Paise> {
    const row = await db.first<{ s: number | null }>(
      `SELECT SUM(amount_paise) AS s FROM transactions
       WHERE type = 'expense' AND category_key = ? AND occurred_at >= ? AND occurred_at < ?`,
      [categoryKey, range.start, range.end],
    );
    return row?.s ?? 0;
  }

  return {
    totals,
    categoryTotal,

    async insights(period: Period, now: Date = new Date()): Promise<PeriodInsights> {
      const { current, previous } = periodRanges(period, now);
      const [cur, prev] = await Promise.all([totals(current), totals(previous)]);

      const catRows = await db.all<{ category_key: string; s: number; c: number }>(
        `SELECT category_key, SUM(amount_paise) AS s, COUNT(*) AS c FROM transactions
         WHERE type = 'expense' AND occurred_at >= ? AND occurred_at < ?
         GROUP BY category_key ORDER BY s DESC`,
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
         WHERE type = 'expense' AND occurred_at >= ? AND occurred_at < ?
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
        .map((_, i) => `COALESCE(SUM(CASE WHEN occurred_at >= ? AND occurred_at < ? THEN amount_paise END), 0) AS b${i}`)
        .join(', ');
      const params = buckets.flatMap((b) => [b.start, b.end]);
      const min = Math.min(...buckets.map((b) => b.start));
      const max = Math.max(...buckets.map((b) => b.end));
      const row = await db.first<Record<string, number>>(
        `SELECT ${cases} FROM transactions WHERE type = 'expense' AND occurred_at >= ? AND occurred_at < ?`,
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
        'SELECT SUM(amount_paise) AS s FROM transactions WHERE category_key = ?',
        [categoryKey],
      );
      return row?.s ?? 0;
    },
  };
}

export type AnalyticsRepo = ReturnType<typeof createAnalyticsRepo>;
