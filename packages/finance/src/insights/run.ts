import { CategoryChange, UnusualPayment, compareCategories, detectUnusualPayments } from './anomalies';
import { InsightTxn } from './common';
import { MonthForecast, forecastMonth } from './forecast';
import { RecurringPayment, detectRecurring, monthlyCost } from './recurring';

export interface Insights {
  recurring: RecurringPayment[];
  /** Sum of the monthly cost of active recurring payments. */
  recurringMonthlyPaise: number;
  forecast: MonthForecast;
  unusual: UnusualPayment[];
  categories: CategoryChange[];
}

/** All detectors over the same rows. Pure and offline; the app passes roughly the last year of transactions. */
export function runInsights(rows: readonly InsightTxn[], now: number): Insights {
  const recurring = detectRecurring(rows, now);
  const active = recurring.filter((r) => r.active);
  return {
    recurring,
    recurringMonthlyPaise: active.reduce((s, r) => s + monthlyCost(r), 0),
    forecast: forecastMonth(rows, recurring, now),
    unusual: detectUnusualPayments(rows, now),
    categories: compareCategories(rows, now),
  };
}
