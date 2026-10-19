import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, resolveCategory, slugifyCategoryKey, validateCategoryLabel } from './categories';
import {
  budgetUsage,
  computeTrend,
  dateFilterStart,
  dayBuckets,
  monthBuckets,
  periodRanges,
  weekBucketsOfMonth,
} from './periods';

// Wed 17 Jun 2026, 14:30 local
const NOW = new Date(2026, 5, 17, 14, 30);

describe('periodRanges', () => {
  it('weeks run Monday to next Monday, exclusive', () => {
    const { current, previous } = periodRanges('week', NOW);
    expect(new Date(current.start)).toEqual(new Date(2026, 5, 15));
    expect(new Date(current.end)).toEqual(new Date(2026, 5, 22));
    expect(previous.end).toBe(current.start);
  });

  it('months and years are half-open and contiguous', () => {
    const m = periodRanges('month', NOW);
    expect(new Date(m.current.start)).toEqual(new Date(2026, 5, 1));
    expect(new Date(m.current.end)).toEqual(new Date(2026, 6, 1));
    expect(new Date(m.previous.start)).toEqual(new Date(2026, 4, 1));
    const y = periodRanges('year', NOW);
    expect(new Date(y.current.start)).toEqual(new Date(2026, 0, 1));
    expect(new Date(y.current.end)).toEqual(new Date(2027, 0, 1));
  });

  it('regression: the last moment of Dec 31 belongs to the year', () => {
    const lastMoment = new Date(2026, 11, 31, 23, 59, 59, 999).getTime();
    const { current } = periodRanges('year', NOW);
    expect(lastMoment >= current.start && lastMoment < current.end).toBe(true);
  });

  it('week boundaries match the history filter (both Monday-based)', () => {
    expect(dateFilterStart('week', NOW)).toBe(periodRanges('week', NOW).current.start);
    expect(dateFilterStart('all', NOW)).toBeNull();
    expect(dateFilterStart('today', NOW)).toBe(new Date(2026, 5, 17).getTime());
  });
});

describe('buckets', () => {
  it('builds N contiguous day buckets ending today', () => {
    const b = dayBuckets(7, NOW);
    expect(b).toHaveLength(7);
    expect(b[6]!.label).toBe('Wed');
    for (let i = 1; i < b.length; i++) expect(b[i]!.start).toBe(b[i - 1]!.end);
  });

  it('builds calendar weeks clipped to the month', () => {
    const b = weekBucketsOfMonth(NOW); // June 2026 starts on a Monday
    expect(b[0]!.start).toBe(new Date(2026, 5, 1).getTime());
    expect(b[b.length - 1]!.end).toBe(new Date(2026, 6, 1).getTime());
    for (let i = 1; i < b.length; i++) expect(b[i]!.start).toBe(b[i - 1]!.end);
    expect(b.map((x) => x.label)[0]).toBe('W1');
  });

  it('clips a month that starts mid-week', () => {
    const b = weekBucketsOfMonth(new Date(2026, 6, 10)); // July 2026 starts on a Wednesday
    expect(b[0]!.start).toBe(new Date(2026, 6, 1).getTime());
    expect(b[0]!.end).toBe(new Date(2026, 6, 6).getTime());
  });

  it('builds 12 month buckets across a year boundary', () => {
    const b = monthBuckets(12, new Date(2026, 1, 10));
    expect(b).toHaveLength(12);
    expect(b[0]!.label).toBe('Mar');
    expect(b[11]!.label).toBe('Feb');
    expect(b[0]!.start).toBe(new Date(2025, 2, 1).getTime());
  });
});

describe('computeTrend', () => {
  it('handles growth, decline, equality and no baseline', () => {
    expect(computeTrend(150, 100)).toEqual({ percent: 50, direction: 'up' });
    expect(computeTrend(50, 100)).toEqual({ percent: 50, direction: 'down' });
    expect(computeTrend(100, 100)).toEqual({ percent: 0, direction: 'neutral' });
    expect(computeTrend(100, 0)).toEqual({ percent: 0, direction: 'neutral' });
  });
});

describe('budgetUsage', () => {
  it('returns null when there is no usable budget (regression: budget 0 gave Infinity%)', () => {
    expect(budgetUsage(100, null)).toBeNull();
    expect(budgetUsage(100, 0)).toBeNull();
  });

  it('clamps the bar but not the percentage', () => {
    expect(budgetUsage(50, 200)).toEqual({ percent: 25, barPercent: 25, over: false });
    expect(budgetUsage(300, 200)).toEqual({ percent: 150, barPercent: 100, over: true });
  });
});

describe('categories', () => {
  it('falls back to "Other", never to Income (regression)', () => {
    expect(resolveCategory(DEFAULT_CATEGORIES, 'deleted-thing').key).toBe('other');
    expect(resolveCategory(DEFAULT_CATEGORIES, 'food').label).toBe('Food');
  });

  it('slugifies uniquely and safely', () => {
    expect(slugifyCategoryKey('Eating Out', [])).toBe('eating-out');
    expect(slugifyCategoryKey('Eating Out', ['eating-out'])).toBe('eating-out-2');
    expect(slugifyCategoryKey('Eating Out', ['eating-out', 'eating-out-2'])).toBe('eating-out-3');
    expect(slugifyCategoryKey('  !!!  ', [])).toBe('category');
    expect(slugifyCategoryKey('Café ☕', [])).toBe('cafe');
  });

  it('validates labels', () => {
    expect(validateCategoryLabel('A', DEFAULT_CATEGORIES).ok).toBe(false);
    expect(validateCategoryLabel('x'.repeat(25), DEFAULT_CATEGORIES).ok).toBe(false);
    expect(validateCategoryLabel('food', DEFAULT_CATEGORIES).ok).toBe(false);
    expect(validateCategoryLabel('food', DEFAULT_CATEGORIES, 'food').ok).toBe(true);
    expect(validateCategoryLabel('Travel', DEFAULT_CATEGORIES).ok).toBe(true);
  });
});
