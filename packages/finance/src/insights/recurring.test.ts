import { describe, expect, it } from 'vitest';
import { payeeKey } from './common';
import { at, monthly, tx } from './fixtures';
import { detectRecurring, monthlyCost } from './recurring';

const NOW = at(2026, 11, 20);

describe('detectRecurring finds real bills', () => {
  it('a monthly subscription', () => {
    const rows = monthly(2026, 11, 6, 5, 649, 'Netflix');
    const [r] = detectRecurring(rows, NOW);
    expect(r).toMatchObject({ payeeName: 'Netflix', cadence: 'monthly', typicalAmountPaise: 64_900, active: true });
    expect(r!.confidence).toBeGreaterThan(0.8);
    expect(r!.evidence.transactionIds).toEqual(rows.map((t) => t.id));
    expect(r!.evidence.formula).toContain('6 payments to Netflix');
    expect(new Date(r!.nextExpectedAt).getMonth()).toBe(11); // early December
  });

  it('a 28-day mobile recharge reads as monthly', () => {
    const rows = [0, 28, 56, 84, 112].map((d) => tx([2026, 7, 1 + d], 299, 'Jio'));
    expect(detectRecurring(rows, NOW)[0]).toMatchObject({ cadence: 'monthly', typicalAmountPaise: 29_900 });
  });

  it('a weekly payment', () => {
    const rows = [0, 7, 14, 21, 28].map((d) => tx([2026, 10, 20 + d], 450, 'Milkman'));
    expect(detectRecurring(rows, NOW)[0]).toMatchObject({ cadence: 'weekly', active: true });
  });

  it('a yearly renewal needs only two payments', () => {
    const rows = [tx([2025, 3, 10], 1499, 'Amazon Prime'), tx([2026, 3, 10], 1499, 'Amazon Prime')];
    expect(detectRecurring(rows, NOW)[0]).toMatchObject({ cadence: 'yearly', active: true });
  });

  it('tolerates a skipped month', () => {
    const rows = [tx([2026, 5, 3], 199, 'Spotify'), tx([2026, 6, 3], 199, 'Spotify'), tx([2026, 8, 3], 199, 'Spotify'), tx([2026, 9, 3], 199, 'Spotify'), tx([2026, 10, 3], 199, 'Spotify')];
    expect(detectRecurring(rows, NOW)[0]?.cadence).toBe('monthly');
  });

  it('tolerates small price changes', () => {
    const rows = [...monthly(2026, 7, 3, 12, 499, 'Hotstar'), ...monthly(2026, 10, 3, 12, 549, 'Hotstar')];
    expect(detectRecurring(rows, NOW)[0]).toMatchObject({ cadence: 'monthly' });
  });

  it('groups name variants and prefers the UPI ID when there is one', () => {
    const rows = [tx([2026, 8, 1], 649, 'NETFLIX.COM'), tx([2026, 9, 1], 649, 'Netflix'), tx([2026, 10, 1], 649, 'netflix 4021')];
    expect(detectRecurring(rows, NOW)).toHaveLength(1);
    expect(payeeKey({ payeeName: 'Anything', payeeVpa: 'Rent@YBL ' })).toBe('vpa:rent@ybl');
  });

  it('marks a cancelled subscription as no longer active', () => {
    const rows = monthly(2026, 6, 5, 1, 149, 'YouTube');
    expect(detectRecurring(rows, NOW)[0]).toMatchObject({ active: false });
  });

  it('reports monthly cost per cadence', () => {
    expect(monthlyCost({ cadence: 'monthly', typicalAmountPaise: 100_00 })).toBe(100_00);
    expect(monthlyCost({ cadence: 'yearly', typicalAmountPaise: 1200_00 })).toBe(100_00);
    expect(monthlyCost({ cadence: 'weekly', typicalAmountPaise: 70_00 })).toBe(304_00);
  });
});

describe('detectRecurring ignores things that are not bills', () => {
  it('frequent food orders at irregular gaps', () => {
    const days = [1, 3, 4, 9, 15, 16, 22, 30, 31, 38, 47, 52];
    const rows = days.map((d, i) => tx([2026, 9, d], 250 + (i % 3) * 120, 'Swiggy'));
    expect(detectRecurring(rows, NOW)).toEqual([]);
  });

  it('same small amount on random days', () => {
    const rows = [2, 5, 11, 12, 19, 27, 29].map((d) => tx([2026, 10, d], 20, 'Chai stall'));
    expect(detectRecurring(rows, NOW)).toEqual([]);
  });

  it('regular dates but amounts that swing too much', () => {
    const rows = [800, 1450, 2100, 950].map((a, i) => tx([2026, 7 + i, 10], a, 'Electricity board'));
    expect(detectRecurring(rows, NOW)).toEqual([]);
  });

  it('only two monthly payments', () => {
    expect(detectRecurring(monthly(2026, 10, 2, 5, 649, 'Netflix'), NOW)).toEqual([]);
  });

  it('a monthly rhythm broken by one odd gap', () => {
    const rows = [tx([2026, 5, 1], 500, 'Gym'), tx([2026, 6, 1], 500, 'Gym'), tx([2026, 6, 15], 500, 'Gym'), tx([2026, 7, 15], 500, 'Gym')];
    expect(detectRecurring(rows, NOW)).toEqual([]);
  });

  it('income, refunds and transfers', () => {
    const salary = monthly(2026, 11, 6, 1, 50_000, 'Acme', { type: 'income' });
    const refunds = monthly(2026, 11, 6, 3, 100, 'Amazon', { type: 'refund' });
    const transfers = monthly(2026, 11, 6, 2, 5_000, 'To Cash', { type: 'transfer' });
    expect(detectRecurring([...salary, ...refunds, ...transfers], NOW)).toEqual([]);
  });

  it('rows in the future and rows without a usable name', () => {
    expect(detectRecurring(monthly(2027, 4, 4, 1, 99, 'Future'), NOW)).toEqual([]);
    expect(detectRecurring(monthly(2026, 11, 5, 1, 99, '1234'), NOW)).toEqual([]);
  });
});
