import { describe, expect, it } from 'vitest';
import { compareCategories, detectUnusualPayments } from './anomalies';
import { at, tx } from './fixtures';

const NOW = at(2026, 11, 20);

describe('detectUnusualPayments', () => {
  const history = [340, 410, 290, 380, 450, 360].map((a, i) => tx([2026, 9, 1 + i * 5], a, 'Swiggy'));

  it('flags a payment far above what the payee usually costs', () => {
    const big = tx([2026, 11, 15], 2_400, 'Swiggy');
    const [u] = detectUnusualPayments([...history, big], NOW);
    expect(u).toMatchObject({ transactionId: big.id, typicalPaise: 370_00, ratio: 6.5 });
    expect(u!.evidence.transactionIds).toHaveLength(7);
    expect(u!.evidence.formula).toContain('6 earlier payments');
  });

  it('does not flag normal variation', () => {
    expect(detectUnusualPayments([...history, tx([2026, 11, 15], 520, 'Swiggy')], NOW)).toEqual([]);
  });

  it('does not flag small absolute jumps even when the ratio is big', () => {
    const chai = [20, 20, 20, 25, 20].map((a, i) => tx([2026, 10, 1 + i], a, 'Chai'));
    expect(detectUnusualPayments([...chai, tx([2026, 11, 18], 120, 'Chai')], NOW)).toEqual([]);
  });

  it('needs four earlier payments', () => {
    const few = [400, 380, 420].map((a, i) => tx([2026, 10, 1 + i], a, 'Zomato'));
    expect(detectUnusualPayments([...few, tx([2026, 11, 10], 5_000, 'Zomato')], NOW)).toEqual([]);
  });

  it('only looks at the recent window', () => {
    const old = tx([2026, 9, 30], 5_000, 'Swiggy');
    expect(detectUnusualPayments([...history, old], NOW)).toEqual([]);
  });

  it('one past splurge does not hide the next one', () => {
    const rows = [...history, tx([2026, 10, 5], 3_000, 'Swiggy'), tx([2026, 11, 12], 3_200, 'Swiggy')];
    expect(detectUnusualPayments(rows, NOW).map((u) => u.amountPaise)).toEqual([3_200_00]);
  });

  it('ignores income', () => {
    const pay = [1_000, 1_000, 1_000, 1_000].map((a, i) => tx([2026, 10, 1 + i], a, 'Client', { type: 'income' }));
    expect(detectUnusualPayments([...pay, tx([2026, 11, 10], 50_000, 'Client', { type: 'income' })], NOW)).toEqual([]);
  });
});

describe('compareCategories', () => {
  const month = (m: number, foodByDay15: number, foodLater: number) => [
    tx([2026, m, 10], foodByDay15, 'Food place', { categoryKey: 'food' }),
    tx([2026, m, 25], foodLater, 'Food place', { categoryKey: 'food' }),
  ];

  it('compares the same days of each month', () => {
    // Earlier months spent 3,000 by the 20th and 5,000 after it. Only the first part should count.
    const rows = [...month(8, 3_000, 5_000), ...month(9, 3_000, 5_000), ...month(10, 3_000, 5_000), tx([2026, 11, 10], 3_300, 'Food place', { categoryKey: 'food' })];
    const [food] = compareCategories(rows, NOW);
    expect(food).toMatchObject({ categoryKey: 'food', currentPaise: 3_300_00, baselinePaise: 3_000_00, changePercent: 10, unusual: false });
    expect(food!.evidence.formula).toContain('Days 1–20');
  });

  it('flags a category well above its usual level', () => {
    const rows = [...month(9, 3_000, 0), ...month(10, 2_800, 0), tx([2026, 11, 10], 6_500, 'Shop', { categoryKey: 'food' })];
    expect(compareCategories(rows, NOW)[0]).toMatchObject({ unusual: true, changePercent: 124 });
  });

  it('does not flag without two earlier months to compare', () => {
    const rows = [...month(10, 1_000, 0), tx([2026, 11, 10], 9_000, 'Shop', { categoryKey: 'food' })];
    expect(compareCategories(rows, NOW)[0]?.unusual).toBe(false);
  });

  it('does not flag a big percentage on a tiny amount', () => {
    const rows = [...month(9, 100, 0), ...month(10, 100, 0), tx([2026, 11, 10], 400, 'Shop', { categoryKey: 'food' })];
    expect(compareCategories(rows, NOW)[0]?.unusual).toBe(false);
  });

  it('subtracts refunds and skips transfers', () => {
    const rows = [
      tx([2026, 11, 2], 1_000, 'Shop', { categoryKey: 'shopping' }),
      tx([2026, 11, 3], 400, 'Shop', { categoryKey: 'shopping', type: 'refund' }),
      tx([2026, 11, 4], 9_000, 'To Cash', { categoryKey: 'transfer', type: 'transfer' }),
    ];
    const out = compareCategories(rows, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ categoryKey: 'shopping', currentPaise: 600_00, changePercent: null });
  });

  it('handles month-end dates against shorter months', () => {
    const rows = [tx([2027, 2, 27], 500, 'X', { categoryKey: 'food' }), tx([2027, 3, 30], 700, 'X', { categoryKey: 'food' })];
    const out = compareCategories(rows, at(2027, 3, 31));
    expect(out[0]).toMatchObject({ currentPaise: 700_00, baselinePaise: 500_00 });
  });
});
