import { describe, expect, it } from 'vitest';
import { goalMonthlyNeed, nextPayday, safeToSpend } from './safe-to-spend';

const NOW = new Date(2026, 10, 18, 14, 30); // Wed 18 Nov 2026

describe('nextPayday', () => {
  it('uses this month when the payday is still ahead', () => {
    expect(nextPayday(25, NOW)).toEqual(new Date(2026, 10, 25));
  });
  it('moves to next month on or after the payday', () => {
    expect(nextPayday(18, NOW)).toEqual(new Date(2026, 11, 18));
    expect(nextPayday(1, NOW)).toEqual(new Date(2026, 11, 1));
  });
  it('clamps to short months', () => {
    expect(nextPayday(31, new Date(2027, 1, 10))).toEqual(new Date(2027, 1, 28));
    expect(nextPayday(31, new Date(2026, 10, 30))).toEqual(new Date(2026, 11, 31));
  });
});

describe('safeToSpend', () => {
  it('without payday lasts until the end of the month, today included', () => {
    const r = safeToSpend({ balancePaise: 13_000_00, budgetRemainingPaise: null, now: NOW });
    expect(r.daysLeft).toBe(13);
    expect(r.periodEnd).toEqual(new Date(2026, 11, 1));
    expect(r).toMatchObject({ safePaise: 13_000_00, perDayPaise: 1_000_00, limitedBy: 'balance' });
  });

  it('with a payday lasts until that day', () => {
    const r = safeToSpend({ balancePaise: 7_000_00, budgetRemainingPaise: null, payday: 25, now: NOW });
    expect(r.daysLeft).toBe(7);
    expect(r.perDayPaise).toBe(1_000_00);
  });

  it('takes the tighter of budget and balance', () => {
    expect(safeToSpend({ balancePaise: 50_000_00, budgetRemainingPaise: 6_500_00, now: NOW })).toMatchObject({
      safePaise: 6_500_00,
      limitedBy: 'budget',
      perDayPaise: 50_000,
    });
    expect(safeToSpend({ balancePaise: 2_000_00, budgetRemainingPaise: 6_500_00, now: NOW })).toMatchObject({
      safePaise: 2_000_00,
      limitedBy: 'balance',
    });
  });

  it('subtracts reserved money from the balance only', () => {
    const r = safeToSpend({ balancePaise: 10_000_00, budgetRemainingPaise: 9_000_00, reservedPaise: 3_000_00, now: NOW });
    expect(r).toMatchObject({ safePaise: 7_000_00, limitedBy: 'balance' });
  });

  it('never goes negative when over budget or overdrawn', () => {
    expect(safeToSpend({ balancePaise: 5_000_00, budgetRemainingPaise: -1_200_00, now: NOW })).toMatchObject({ safePaise: 0, perDayPaise: 0, limitedBy: 'budget' });
    expect(safeToSpend({ balancePaise: -300_00, budgetRemainingPaise: null, now: NOW }).safePaise).toBe(0);
  });

  it('reports nothing to go on when neither is known', () => {
    expect(safeToSpend({ balancePaise: null, budgetRemainingPaise: null, now: NOW })).toMatchObject({ safePaise: 0, limitedBy: 'none' });
  });

  it('on the last day of the month counts one day', () => {
    const r = safeToSpend({ balancePaise: 999_99, budgetRemainingPaise: null, now: new Date(2026, 10, 30, 23, 59) });
    expect(r.daysLeft).toBe(1);
    expect(r.perDayPaise).toBe(999_00);
  });

  it('rounds the daily figure down so it never promises more than is there', () => {
    const r = safeToSpend({ balancePaise: 100, budgetRemainingPaise: null, now: NOW });
    expect(r.perDayPaise * r.daysLeft).toBeLessThanOrEqual(100);
  });
});

describe('goalMonthlyNeed', () => {
  it('spreads what is left over the months to the deadline, this month included', () => {
    expect(goalMonthlyNeed({ targetPaise: 30_000_00, savedPaise: 0, deadline: new Date(2027, 0, 31).getTime() }, NOW)).toBe(10_000_00);
  });
  it('asks for everything when the deadline is this month or past', () => {
    expect(goalMonthlyNeed({ targetPaise: 5_000_00, savedPaise: 1_000_00, deadline: new Date(2026, 10, 30).getTime() }, NOW)).toBe(4_000_00);
    expect(goalMonthlyNeed({ targetPaise: 5_000_00, savedPaise: 1_000_00, deadline: new Date(2026, 0, 1).getTime() }, NOW)).toBe(4_000_00);
  });
  it('is zero when reached and null without a deadline', () => {
    expect(goalMonthlyNeed({ targetPaise: 100, savedPaise: 200, deadline: null }, NOW)).toBe(0);
    expect(goalMonthlyNeed({ targetPaise: 100, savedPaise: 0, deadline: null }, NOW)).toBeNull();
  });
  it('rounds up to whole rupees', () => {
    // ₹1,000 over Nov, Dec and Jan is ₹333.33 a month; ₹334 gets there.
    expect(goalMonthlyNeed({ targetPaise: 1_000_00, savedPaise: 0, deadline: new Date(2027, 0, 1).getTime() }, NOW)).toBe(334_00);
  });
});
