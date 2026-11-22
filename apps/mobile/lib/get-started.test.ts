import { describe, expect, it } from 'vitest';
import { getStartedComplete, getStartedItems } from './get-started';

const fresh = { transactions: 0, upiPayments: 0, hasOverallBudget: false, shortcutsTipSeen: false, backupOn: false };

describe('getStartedItems', () => {
  it('starts with nothing done', () => {
    const items = getStartedItems(fresh);
    expect(items.map((i) => i.done)).toEqual([false, false, false, false, false]);
    expect(getStartedComplete(items)).toBe(false);
  });

  it('ticks each step from what the app already knows', () => {
    const items = getStartedItems({ ...fresh, transactions: 3, upiPayments: 1, hasOverallBudget: true });
    expect(items.filter((i) => i.done).map((i) => i.step)).toEqual(['first-expense', 'upi-payment', 'budget']);
  });

  it('is complete without the optional backup', () => {
    const items = getStartedItems({ transactions: 1, upiPayments: 1, hasOverallBudget: true, shortcutsTipSeen: true, backupOn: false });
    expect(getStartedComplete(items)).toBe(true);
  });
});
