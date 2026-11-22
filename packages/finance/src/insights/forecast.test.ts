import { describe, expect, it } from 'vitest';
import { InsightTxn } from './common';
import { at, monthly, tx } from './fixtures';
import { forecastMonth } from './forecast';
import { detectRecurring } from './recurring';

const NOW = at(2026, 11, 20); // 20 of 30 days elapsed, 10 left

/** Spread `total` rupees evenly over days 1..days of a month. */
function daily(year: number, month: number, days: number, total: number, payee = 'Groceries'): InsightTxn[] {
  return Array.from({ length: days }, (_, i) => tx([year, month, i + 1], total / days, `${payee} ${String.fromCharCode(97 + (i % 26))}`));
}

const run = (rows: InsightTxn[]) => forecastMonth(rows, detectRecurring(rows, NOW), NOW);

describe('forecastMonth', () => {
  it('with only this month, projects the current pace with a ±25% band', () => {
    const f = run(daily(2026, 11, 20, 10_000));
    expect(f.daysLeft).toBe(10);
    expect(f.spentPaise).toBe(10_000_00);
    expect(f.likelyPaise).toBe(15_000_00);
    expect(f.lowPaise).toBe(13_750_00);
    expect(f.highPaise).toBe(16_250_00);
  });

  it('uses the spread of recent months for the range', () => {
    const rows = [...daily(2026, 8, 31, 9_300), ...daily(2026, 9, 30, 18_000), ...daily(2026, 10, 31, 12_400), ...daily(2026, 11, 20, 10_000)];
    const f = run(rows);
    // Rates: 300, 600, 400 and 500 a day. Low uses 300, high 600, likely the median 450.
    expect(f.lowPaise).toBe(13_000_00);
    expect(f.highPaise).toBe(16_000_00);
    expect(f.likelyPaise).toBe(14_500_00);
    expect(f.lowPaise).toBeLessThanOrEqual(f.likelyPaise);
    expect(f.likelyPaise).toBeLessThanOrEqual(f.highPaise);
  });

  it('adds a bill expected later this month once, at its usual amount', () => {
    const rows = [...monthly(2026, 10, 5, 25, 649, 'Netflix'), ...daily(2026, 11, 20, 10_000)];
    const f = run(rows);
    expect(f.upcomingBills).toEqual([expect.objectContaining({ payeeName: 'Netflix', amountPaise: 64_900 })]);
    expect(f.likelyPaise - f.upcomingPaise).toBeGreaterThan(0);
    expect(f.evidence.formula).toContain('1 upcoming bill');
  });

  it('does not count a bill already paid this month', () => {
    const rows = [...monthly(2026, 11, 6, 5, 649, 'Netflix'), ...daily(2026, 11, 20, 10_000)];
    const f = run(rows);
    expect(f.upcomingBills).toEqual([]);
    expect(f.spentPaise).toBe(10_649_00);
    // The paid bill is not part of the day-to-day rate, so it doesn't get projected again.
    expect(f.likelyPaise).toBe(15_649_00);
  });

  it('ignores bills next due after this month', () => {
    const rows = [...monthly(2026, 11, 6, 2, 999, 'Gym').slice(0, 5), ...daily(2026, 11, 20, 2_000)];
    // Last Gym payment 2 Oct: next is around 1 Nov, which is in the past, so it isn't upcoming either.
    expect(run(rows).upcomingBills).toEqual([]);
  });

  it('counts each remaining weekly payment', () => {
    const rows = [0, 7, 14, 21, 28, 35].map((d) => tx([2026, 10, 15 + d], 400, 'Milkman'));
    const f = run(rows);
    // Last paid 19 Nov; next 26 Nov, then 3 Dec is next month.
    expect(f.upcomingBills).toHaveLength(1);
    expect(f.upcomingPaise).toBe(400_00);
  });

  it('subtracts refunds and ignores income and transfers', () => {
    const rows = [
      tx([2026, 11, 2], 2_000, 'Shop'),
      tx([2026, 11, 3], 500, 'Shop', { type: 'refund' }),
      tx([2026, 11, 4], 50_000, 'Acme', { type: 'income' }),
      tx([2026, 11, 5], 3_000, 'To Cash', { type: 'transfer' }),
    ];
    expect(run(rows).spentPaise).toBe(1_500_00);
  });

  it('on the last day there is nothing left to project', () => {
    const rows = daily(2026, 11, 30, 3_000);
    const f = forecastMonth(rows, [], at(2026, 11, 30));
    expect(f.daysLeft).toBe(0);
    expect(f.lowPaise).toBe(f.highPaise);
  });

  it('regression: a one-off big payment is counted once, not spread over the days left', () => {
    // What the emulator showed after importing a statement with no earlier history: rent of ₹15,000 was treated as
    // day-to-day spending and projected ₹944/day, an estimate of ₹28,341.43.
    const now = at(2026, 11, 21);
    const rows = [
      tx([2026, 11, 1], 60_000, 'Acme', { type: 'income' }),
      tx([2026, 11, 2], 340, 'Swiggy'),
      tx([2026, 11, 3], 15_000, 'Landlord Sharma'),
      tx([2026, 11, 5], 649, 'Netflix'),
      tx([2026, 11, 7], 1_850, 'BigBasket'),
      tx([2026, 11, 10], 2_000, 'ATM'),
    ];
    const f = forecastMonth(rows, detectRecurring(rows, now), now);
    // Day-to-day: ₹4,839 over 21 days = ₹230.43/day; 9 days left ≈ ₹2,074 more.
    expect(f.spentPaise).toBe(19_839_00);
    expect(f.likelyPaise).toBe(21_913_00);
    expect(f.evidence.formula).toContain('One-off payments this month (₹15,000) are counted once');
    expect(f.evidence.formula).not.toContain('upcoming bill');
  });

  it('estimates are whole rupees', () => {
    const f = run(daily(2026, 11, 20, 10_001));
    for (const v of [f.lowPaise, f.likelyPaise, f.highPaise]) expect(v % 100).toBe(0);
  });

  it('an empty month forecasts zero', () => {
    const f = run([]);
    expect([f.lowPaise, f.likelyPaise, f.highPaise]).toEqual([0, 0, 0]);
  });
});
