import { describe, expect, it } from 'vitest';
import { budgetStatus } from '../ledger';
import { periodRanges } from '../periods';
import { budgetProjection } from './budget-forecast';
import { InsightTxn } from './common';
import { at, tx } from './fixtures';
import { detectRecurring } from './recurring';

const NOW = at(2026, 11, 10); // 10 of 30 days elapsed

/** Rent of ₹15,000 on the 3rd every month, and ₹100 of food every day. */
function ledger(): InsightTxn[] {
  const rows: InsightTxn[] = [];
  for (const m of [8, 9, 10, 11]) {
    rows.push(tx([2026, m, 3], 15_000, 'Landlord', { categoryKey: 'rent' }));
    const days = m === 11 ? 9 : new Date(2026, m, 0).getDate();
    for (let d = 1; d <= days; d++) rows.push(tx([2026, m, d], 100, `Canteen ${d % 3}`, { categoryKey: 'food' }));
  }
  return rows;
}

describe('budgetProjection', () => {
  const rows = ledger();
  const recurring = detectRecurring(rows, NOW);
  const { current } = periodRanges('month', new Date(NOW));
  const spent = 15_000_00 + 9 * 100_00;

  it('regression: rent paid early is not extrapolated across the month', () => {
    // A straight line from ₹15,900 over 10 days says ₹47,700 by month end and flags a ₹30,000 budget as off track.
    const straight = budgetStatus({ limitPaise: 30_000_00, spentPaise: spent, period: current, now: NOW });
    expect(straight.onTrack).toBe(false);

    const projected = budgetProjection(rows, recurring, null, NOW);
    // ₹15,000 rent once + about ₹100 a day for the whole month.
    expect(projected).toBeGreaterThan(17_500_00);
    expect(projected).toBeLessThan(19_000_00);
    const status = budgetStatus({ limitPaise: 30_000_00, spentPaise: spent, period: current, now: NOW, projectedPaise: projected });
    expect(status).toMatchObject({ onTrack: true, projectedPaise: projected });
  });

  it('works per category', () => {
    expect(budgetProjection(rows, recurring, 'rent', NOW)).toBe(15_000_00);
    const food = budgetProjection(rows, recurring, 'food', NOW);
    expect(food).toBeGreaterThan(2_800_00);
    expect(food).toBeLessThan(3_200_00);
  });

  it('never projects less than what is already spent', () => {
    const status = budgetStatus({ limitPaise: 1_000_00, spentPaise: 5_000_00, period: current, now: NOW, projectedPaise: 100 });
    expect(status.projectedPaise).toBe(5_000_00);
  });
});
