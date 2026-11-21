import { describe, expect, it } from 'vitest';
import {
  LedgerEntry,
  accountBalance,
  balanceEffect,
  budgetStatus,
  incomeEffect,
  projectPeriodSpend,
  rolloverFrom,
  savingsRate,
  spendingEffect,
} from './ledger';

const DAY = 24 * 60 * 60 * 1000;
const e = (type: LedgerEntry['type'], amountPaise: number, transferRole?: 'in' | 'out'): LedgerEntry => ({
  type,
  amountPaise,
  transferRole,
});

describe('ledger effects', () => {
  it('moves balances the right way for every type', () => {
    expect(balanceEffect(e('income', 100))).toBe(100);
    expect(balanceEffect(e('expense', 100))).toBe(-100);
    expect(balanceEffect(e('refund', 100))).toBe(100);
    expect(balanceEffect(e('transfer', 100, 'out'))).toBe(-100);
    expect(balanceEffect(e('transfer', 100, 'in'))).toBe(100);
  });

  it('never counts transfers as spending or income', () => {
    expect(spendingEffect(e('transfer', 500, 'out'))).toBe(0);
    expect(spendingEffect(e('transfer', 500, 'in'))).toBe(0);
    expect(incomeEffect(e('transfer', 500, 'in'))).toBe(0);
  });

  it('treats refunds as negative spending, not income', () => {
    expect(spendingEffect(e('refund', 300))).toBe(-300);
    expect(incomeEffect(e('refund', 300))).toBe(0);
  });

  it('keeps total money constant across a transfer between two accounts', () => {
    const bank = accountBalance(10_000, [e('transfer', 2_500, 'out')]);
    const wallet = accountBalance(0, [e('transfer', 2_500, 'in')]);
    expect(bank + wallet).toBe(10_000);
  });

  it('computes balances from an opening balance', () => {
    expect(accountBalance(1_000, [e('income', 5_000), e('expense', 1_200), e('refund', 200)])).toBe(5_000);
    expect(accountBalance(0, [])).toBe(0);
  });
});

describe('savingsRate', () => {
  it('handles normal, negative and no-income months', () => {
    expect(savingsRate(60_000, 45_000)).toBe(25);
    expect(savingsRate(10_000, 15_000)).toBe(-50);
    expect(savingsRate(0, 500)).toBeNull();
  });
});

describe('projectPeriodSpend', () => {
  const period = { start: 0, end: 30 * DAY };

  it('extends the current pace to the end of the period', () => {
    expect(projectPeriodSpend(20_000, period, 10 * DAY)).toBe(60_000);
  });

  it('does not explode in the first hours of a period', () => {
    expect(projectPeriodSpend(1_000, period, 60 * 60 * 1000)).toBe(30_000);
  });

  it('returns what was spent once the period is over', () => {
    expect(projectPeriodSpend(5_000, period, 31 * DAY)).toBe(5_000);
  });
});

describe('budgets', () => {
  const period = { start: 0, end: 30 * DAY };

  it('carries only unused budget forward', () => {
    expect(rolloverFrom(10_000, 7_500)).toBe(2_500);
    expect(rolloverFrom(10_000, 12_000)).toBe(0);
  });

  it('reports status, including rollover and projection', () => {
    expect(budgetStatus({ limitPaise: 9_000, carriedPaise: 1_000, spentPaise: 4_000, period, now: 10 * DAY })).toEqual({
      limitPaise: 9_000,
      carriedPaise: 1_000,
      availablePaise: 10_000,
      spentPaise: 4_000,
      remainingPaise: 6_000,
      percent: 40,
      projectedPaise: 12_000,
      over: false,
      onTrack: false,
    });
  });

  it('flags overspending and never shows negative spending after refunds', () => {
    const over = budgetStatus({ limitPaise: 1_000, spentPaise: 1_500, period, now: 29 * DAY });
    expect(over).toMatchObject({ over: true, remainingPaise: -500, percent: 150 });
    expect(budgetStatus({ limitPaise: 1_000, spentPaise: -200, period, now: DAY }).spentPaise).toBe(0);
  });

  it('handles a zero limit without dividing by zero', () => {
    expect(budgetStatus({ limitPaise: 0, spentPaise: 100, period, now: DAY }).percent).toBe(0);
  });
});
