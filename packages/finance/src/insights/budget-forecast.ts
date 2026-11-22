import { InsightTxn } from './common';
import { forecastMonth } from './forecast';
import { RecurringPayment } from './recurring';

/**
 * Likely month-end spending for one budget (a category, or everything when `categoryKey` is null). Uses the month
 * forecast, so a large bill already paid early in the month (rent on the 3rd) is counted once instead of being
 * extrapolated across the whole month the way a straight line would.
 */
export function budgetProjection(rows: readonly InsightTxn[], recurring: readonly RecurringPayment[], categoryKey: string | null, now: number): number {
  const scoped = categoryKey === null ? rows : rows.filter((t) => t.categoryKey === categoryKey);
  const bills = categoryKey === null ? recurring : recurring.filter((r) => r.categoryKey === categoryKey);
  return forecastMonth(scoped, bills, now).likelyPaise;
}
