import {
  addDays,
  addMonths,
  addWeeks,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  addYears,
} from 'date-fns';

export type Period = 'week' | 'month' | 'year';

/** Half-open interval [start, end) in epoch milliseconds. */
export interface Range {
  start: number;
  end: number;
}

export interface PeriodRanges {
  current: Range;
  previous: Range;
}

/** Weeks start on Monday everywhere in the app (analytics, history filters, charts). */
export const WEEK_STARTS_ON = 1 as const;

export function periodRanges(period: Period, now: Date): PeriodRanges {
  switch (period) {
    case 'week': {
      const start = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
      return {
        current: { start: start.getTime(), end: addWeeks(start, 1).getTime() },
        previous: { start: addWeeks(start, -1).getTime(), end: start.getTime() },
      };
    }
    case 'month': {
      const start = startOfMonth(now);
      return {
        current: { start: start.getTime(), end: addMonths(start, 1).getTime() },
        previous: { start: addMonths(start, -1).getTime(), end: start.getTime() },
      };
    }
    case 'year': {
      const start = startOfYear(now);
      return {
        current: { start: start.getTime(), end: addYears(start, 1).getTime() },
        previous: { start: addYears(start, -1).getTime(), end: start.getTime() },
      };
    }
  }
}

export type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year';

/** Lower bound (inclusive) for the history screen's date filter; `null` means unbounded. */
export function dateFilterStart(filter: DateFilter, now: Date): number | null {
  switch (filter) {
    case 'all':
      return null;
    case 'today':
      return startOfDay(now).getTime();
    case 'week':
      return periodRanges('week', now).current.start;
    case 'month':
      return periodRanges('month', now).current.start;
    case 'year':
      return periodRanges('year', now).current.start;
  }
}

export interface Bucket extends Range {
  label: string;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The last `days` calendar days ending today (oldest first). */
export function dayBuckets(days: number, now: Date): Bucket[] {
  const today = startOfDay(now);
  const out: Bucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = addDays(today, -i);
    out.push({ start: start.getTime(), end: addDays(start, 1).getTime(), label: SHORT_DAYS[start.getDay()]! });
  }
  return out;
}

/** Calendar weeks (Monday start) overlapping the current month, clipped to month boundaries. */
export function weekBucketsOfMonth(now: Date): Bucket[] {
  const monthStart = startOfMonth(now);
  const monthEnd = addMonths(monthStart, 1);
  const out: Bucket[] = [];
  let weekStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
  let n = 1;
  while (weekStart.getTime() < monthEnd.getTime()) {
    const weekEnd = addWeeks(weekStart, 1);
    out.push({
      start: Math.max(weekStart.getTime(), monthStart.getTime()),
      end: Math.min(weekEnd.getTime(), monthEnd.getTime()),
      label: `W${n++}`,
    });
    weekStart = weekEnd;
  }
  return out;
}

/** The last `months` calendar months ending with the current one (oldest first). */
export function monthBuckets(months: number, now: Date): Bucket[] {
  const thisMonth = startOfMonth(now);
  const out: Bucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = addMonths(thisMonth, -i);
    out.push({ start: start.getTime(), end: addMonths(start, 1).getTime(), label: SHORT_MONTHS[start.getMonth()]! });
  }
  return out;
}

export interface Trend {
  percent: number;
  direction: 'up' | 'down' | 'neutral';
}

/** Change of `current` relative to `previous`; neutral when there is nothing to compare against. */
export function computeTrend(current: number, previous: number): Trend {
  if (previous <= 0) return { percent: 0, direction: 'neutral' };
  if (current === previous) return { percent: 0, direction: 'neutral' };
  return {
    percent: Math.round((Math.abs(current - previous) / previous) * 100),
    direction: current > previous ? 'up' : 'down',
  };
}

export interface BudgetUsage {
  /** Whole-number percentage of the budget spent (may exceed 100). */
  percent: number;
  /** Width for a progress bar, clamped to 0..100. */
  barPercent: number;
  over: boolean;
}

/** `budget` of 0 or less means "no budget". */
export function budgetUsage(spent: number, budget: number | null): BudgetUsage | null {
  if (budget === null || budget <= 0) return null;
  const percent = Math.round((spent / budget) * 100);
  return { percent, barPercent: Math.max(0, Math.min(100, percent)), over: spent > budget };
}

/** YYYY-MM in local time, used for display grouping only (never stored). */
export function monthLabel(date: Date): string {
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
