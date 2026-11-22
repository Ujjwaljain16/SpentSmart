import { describe, expect, it } from 'vitest';
import { EVAL_NOW, fixtureLedger } from './evals/fixture';
import { runTool } from './tools';

/**
 * Tool answers checked against totals worked out by hand from the fixture (see the comments). Fixture rows are at
 * 13:00 and "now" is 20 Nov 12:00, so nothing dated 20 November counts yet.
 */
const ledger = fixtureLedger();
const run = (name: string, input: Record<string, unknown>) => runTool(name, input, ledger, EVAL_NOW);
const search = (over: Record<string, unknown>) =>
  run('search_transactions', { text: null, category: null, type: null, period: null, from_date: null, to_date: null, min_amount_rupees: null, max_amount_rupees: null, limit: 10, ...over });

describe('get_summary', () => {
  it('this month: 1–19 Nov', async () => {
    // rent 15,000 + Netflix 649 + Spotify 119 + electricity 1,200 + Swiggy 340+420+380+2,400 + Zomato 520
    // + BigBasket 1,850 + Uber 180+220+260 = 23,538. Income: salary 60,000 + freelance 8,000. The transfer is ignored.
    const { result } = await run('get_summary', { period: 'this_month' });
    expect(result).toMatchObject({ spending: '₹23,538', income: '₹68,000', net: '₹44,462', savings_rate_percent: 65 });
  });

  it('last month: October', async () => {
    // 15,000 + 649 + 119 + 1,200 + Swiggy 1,590 + Zomato 1,130 + BigBasket 3,700 + Uber 900 + Jio 299
    // + Myntra 2,500 + sweets 3,000 = 30,087
    const { result } = await run('get_summary', { period: 'last_month' });
    expect(result).toMatchObject({ spending: '₹30,087', income: '₹60,000', net: '₹29,913', savings_rate_percent: 50 });
    expect((result.top_categories as { category: string; spending: string }[])[0]).toEqual({ category: 'Rent', spending: '₹15,000', share_percent: 50 });
  });

  it('a refund cancels its purchase', async () => {
    // September: the ₹4,999 headphones were bought and returned.
    const { result } = await search({ text: 'amazon' });
    expect(result).toMatchObject({ match_count: 2, total: '₹0' });
  });
});

describe('search_transactions', () => {
  it('payee text within a period', async () => {
    expect((await search({ text: 'swiggy', period: 'this_month' })).result).toMatchObject({ match_count: 4, total: '₹3,540' });
  });
  it('tags', async () => {
    expect((await search({ text: 'diwali' })).result).toMatchObject({ match_count: 2, total: '₹5,500' });
  });
  it('category, date range and limit', async () => {
    const { result } = await search({ category: 'transport', from_date: '2026-08-01', limit: 3 });
    // 4 rides a month for Aug–Oct (900 each) plus 3 in November (660).
    expect(result).toMatchObject({ match_count: 15, total: '₹3,360', showing: 3 });
  });
  it('amount range and type', async () => {
    // Rent is the only expense of ₹5,000 or more this month; salary and freelance are income.
    expect((await search({ period: 'this_month', min_amount_rupees: 5000 })).result).toMatchObject({ match_count: 3 });
    expect((await search({ period: 'this_month', min_amount_rupees: 5000, type: 'expense' })).result).toMatchObject({ match_count: 1, total: '₹15,000' });
  });
  it('nothing found is an empty result, not an error', async () => {
    const out = await search({ text: 'starbucks' });
    expect(out.isError).toBeUndefined();
    expect(out.result).toMatchObject({ match_count: 0, total: '₹0', transactions: [] });
  });
  it('an unknown category is an error the model can fix', async () => {
    const out = await search({ category: 'Crypto' });
    expect(out.isError).toBe(true);
    expect(out.result.categories).toContain('Food');
  });
  it('rejects a bad date', async () => {
    expect((await search({ from_date: '20/11/2026' })).isError).toBe(true);
  });
});

describe('budget_status', () => {
  it('reports left and pace', async () => {
    const { result } = await run('budget_status', {});
    const [overall, food] = result.budgets as Record<string, unknown>[];
    expect(overall).toMatchObject({ budget: 'Overall monthly budget', limit: '₹40,000', spent: '₹23,538', left: '₹16,462' });
    // Food: Swiggy 3,540 + Zomato 520 + BigBasket 1,850 = 5,910 of 9,000.
    expect(food).toMatchObject({ budget: 'Food', spent: '₹5,910', left: '₹3,090' });
  });
});

describe('upcoming_recurring', () => {
  it('finds the subscriptions and rent', async () => {
    const { result } = await run('upcoming_recurring', {});
    const payees = (result.bills as { payee: string }[]).map((b) => b.payee);
    expect(payees).toEqual(expect.arrayContaining(['Netflix', 'Spotify', 'Landlord', 'Jio', 'Electricity board']));
    expect(payees).not.toContain('Amazon');
  });
});

describe('can_i_afford', () => {
  it('a small purchase fits, a big one does not', async () => {
    const small = await run('can_i_afford', { amount_rupees: 3000 });
    expect(small.result).toMatchObject({ verdict: 'fits', limited_by: 'budget', safe_to_spend_until_period_end: '₹16,462', left_after_purchase: '₹13,462' });
    const big = await run('can_i_afford', { amount_rupees: 60000 });
    expect(big.result).toMatchObject({ verdict: 'does not fit', short_by: '₹43,538' });
  });
  it('rejects nonsense amounts', async () => {
    expect((await run('can_i_afford', { amount_rupees: -5 })).isError).toBe(true);
  });
});

describe('goals_status', () => {
  it('reports progress and monthly need', async () => {
    const { result } = await run('goals_status', {});
    // Goa: 18,000 left over Nov–Mar (5 months) = 3,600 a month.
    expect((result.goals as unknown[])[0]).toMatchObject({ goal: 'Goa trip', saved: '₹12,000', remaining: '₹18,000', percent: 40, needed_per_month: '₹3,600' });
    expect((result.goals as unknown[])[1]).toMatchObject({ goal: 'Emergency fund', needed_per_month: null });
  });
});

describe('mutating tools only propose', () => {
  it('create_transaction returns a proposal and says it is not saved', async () => {
    const out = await run('create_transaction', { amount_rupees: 250, type: 'expense', payee: 'Canteen', category: 'food', date: null, note: 'Lunch' });
    expect(out.proposal).toEqual({ kind: 'transaction', amountPaise: 25_000, type: 'expense', payeeName: 'Canteen', categoryKey: 'food', occurredAt: EVAL_NOW, note: 'Lunch' });
    expect(String(out.result.status)).toMatch(/not saved/);
  });
  it('unknown categories fall back to Other, income always goes to Income', async () => {
    expect((await run('create_transaction', { amount_rupees: 1, type: 'expense', payee: 'X', category: 'Spaceships', date: null, note: null })).proposal).toMatchObject({ categoryKey: 'other' });
    expect((await run('create_transaction', { amount_rupees: 1, type: 'income', payee: 'X', category: 'Food', date: null, note: null })).proposal).toMatchObject({ categoryKey: 'income' });
  });
  it('create_goal', async () => {
    const out = await run('create_goal', { name: 'Laptop', target_rupees: 50000, deadline: '2027-06-30' });
    expect(out.proposal).toEqual({ kind: 'goal', name: 'Laptop', targetPaise: 50_000_00, deadline: new Date(2027, 5, 30).getTime() });
  });
});

describe('runTool', () => {
  it('turns unknown tools and bad input into error results', async () => {
    expect((await run('delete_everything', {})).isError).toBe(true);
    expect((await runTool('get_summary', 'nope', ledger, EVAL_NOW)).isError).toBe(true);
    expect((await run('create_transaction', { amount_rupees: 10, type: 'transfer', payee: 'X', category: null, date: null, note: null })).isError).toBe(true);
  });
});
