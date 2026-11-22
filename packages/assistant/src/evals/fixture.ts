import { DEFAULT_CATEGORIES } from '@spentsmart/finance/categories';
import { budgetProjection } from '@spentsmart/finance/insights/budget-forecast';
import { detectRecurring } from '@spentsmart/finance/insights/recurring';
import { budgetStatus, spendingEffect } from '@spentsmart/finance/ledger';
import { periodRanges } from '@spentsmart/finance/periods';
import { Category, Goal } from '@spentsmart/finance/types';
import { AssistantTxn, LedgerSource } from '../ledger';

/** "Now" for every eval: Friday 20 November 2026, midday. */
export const EVAL_NOW = new Date(2026, 10, 20, 12, 0).getTime();

export const FIXTURE_CATEGORIES: Category[] = [
  ...DEFAULT_CATEGORIES,
  { key: 'transport', label: 'Transport', icon: 'car', color: '#EF4444', sortOrder: 6, isSystem: false },
  { key: 'shopping', label: 'Shopping', icon: 'cart', color: '#10B981', sortOrder: 7, isSystem: false },
  { key: 'entertainment', label: 'Entertainment', icon: 'film', color: '#6366F1', sortOrder: 8, isSystem: false },
];

/**
 * Four months of a student-turned-first-job ledger, August to 20 November 2026. Built by rules rather than random
 * numbers so a person can check any answer by hand.
 */
export function fixtureTransactions(): AssistantTxn[] {
  const rows: AssistantTxn[] = [];
  let n = 0;
  const add = (y: number, m: number, d: number, rupees: number, payee: string, categoryKey: string, type: AssistantTxn['type'] = 'expense', extra: Partial<AssistantTxn> = {}) => {
    const occurredAt = new Date(y, m - 1, d, 13, 0).getTime();
    if (occurredAt > EVAL_NOW) return;
    rows.push({ id: `fx${++n}`, type, amountPaise: Math.round(rupees * 100), occurredAt, payeeName: payee, payeeVpa: null, categoryKey, note: null, tags: [], ...extra });
  };

  for (const m of [8, 9, 10, 11]) {
    add(2026, m, 1, 60_000, 'Acme Technologies', 'income', 'income', { note: 'Salary' });
    add(2026, m, 3, 15_000, 'Landlord', 'rent');
    add(2026, m, 5, 649, 'Netflix', 'entertainment');
    add(2026, m, 12, 119, 'Spotify', 'entertainment');
    add(2026, m, 18, 1_200, 'Electricity board', 'utility');
    // Food: Swiggy on the 2nd, 9th, 16th, 23rd; Zomato on the 6th and 20th; groceries on the 7th and 21st.
    for (const [d, r] of [[2, 340], [9, 420], [16, 380], [23, 450]] as const) add(2026, m, d, r, 'Swiggy', 'food');
    for (const [d, r] of [[6, 520], [20, 610]] as const) add(2026, m, d, r, 'Zomato', 'food');
    for (const d of [7, 21]) add(2026, m, d, 1_850, 'BigBasket', 'food');
    // Transport: Uber on the 4th, 11th, 19th, 26th.
    for (const [d, r] of [[4, 180], [11, 220], [19, 260], [26, 240]] as const) add(2026, m, d, r, 'Uber', 'transport');
  }
  // Mobile recharge every 28 days.
  for (const d of [2, 30, 27 + 31, 24 + 31 + 30, 22 + 31 + 30 + 31]) {
    const date = new Date(2026, 7, d);
    add(date.getFullYear(), date.getMonth() + 1, date.getDate(), 299, 'Jio', 'utility');
  }
  // One-offs.
  add(2026, 9, 14, 4_999, 'Amazon', 'shopping', 'expense', { note: 'Headphones' });
  add(2026, 9, 20, 4_999, 'Amazon', 'shopping', 'refund', { note: 'Headphones returned' });
  add(2026, 10, 24, 2_500, 'Myntra', 'shopping', 'expense', { tags: ['diwali'] });
  add(2026, 10, 25, 3_000, 'Sweet shop', 'food', 'expense', { tags: ['diwali'] });
  add(2026, 11, 8, 8_000, 'Freelance client', 'income', 'income', { note: 'Logo design' });
  add(2026, 11, 10, 2_000, 'To Cash', 'transfer', 'transfer');
  add(2026, 11, 15, 2_400, 'Swiggy', 'food', 'expense', { note: 'Team dinner' });
  return rows;
}

export const FIXTURE_GOALS: Goal[] = [
  { id: 'g1', name: 'Goa trip', targetPaise: 30_000_00, savedPaise: 12_000_00, deadline: new Date(2027, 2, 31).getTime(), archived: false },
  { id: 'g2', name: 'Emergency fund', targetPaise: 1_00_000_00, savedPaise: 25_000_00, deadline: null, archived: false },
];

const BUDGETS: { categoryKey: string | null; limitPaise: number }[] = [
  { categoryKey: null, limitPaise: 40_000_00 },
  { categoryKey: 'food', limitPaise: 9_000_00 },
];

export function fixtureLedger(rows: AssistantTxn[] = fixtureTransactions()): LedgerSource {
  return {
    async transactions(start, end) {
      return rows.filter((t) => t.occurredAt >= start && t.occurredAt < end);
    },
    async categories() {
      return FIXTURE_CATEGORIES;
    },
    async budgets(now) {
      const { current } = periodRanges('month', new Date(now));
      const recurring = detectRecurring(rows, now);
      return BUDGETS.map((b) => {
        const spent = rows
          .filter((t) => t.occurredAt >= current.start && t.occurredAt < current.end && (b.categoryKey === null || t.categoryKey === b.categoryKey))
          .reduce((s, t) => s + spendingEffect(t), 0);
        const projectedPaise = budgetProjection(rows, recurring, b.categoryKey, now);
        return { categoryKey: b.categoryKey, status: budgetStatus({ limitPaise: b.limitPaise, spentPaise: spent, period: current, now, projectedPaise }) };
      });
    },
    async goals() {
      return FIXTURE_GOALS;
    },
    async accounts() {
      return [
        { id: 'default-bank', name: 'Bank & UPI', type: 'bank', openingBalancePaise: 50_000_00, balancePaise: 50_000_00 },
        { id: 'default-cash', name: 'Cash', type: 'cash', openingBalancePaise: 1_000_00, balancePaise: 3_000_00 },
      ];
    },
    async payday() {
      return 1;
    },
  };
}
