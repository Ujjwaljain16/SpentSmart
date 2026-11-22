import { runTool } from '@spentsmart/assistant/tools';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/tests/helpers/node-driver';
import { applyProposal, repositoryLedger } from './ledger';

const NOW = new Date(2026, 5, 17, 12).getTime(); // Wed 17 Jun 2026

async function seeded() {
  const ctx = await createTestContext(NOW);
  const r = ctx.repos;
  const add = (day: number, amount: number, payee: string, over: Record<string, unknown> = {}) =>
    r.transactions.insert({ amountPaise: amount * 100, type: 'expense', categoryKey: 'food', payeeName: payee, paymentMethod: 'upi', verifiedBy: 'manual', occurredAt: new Date(2026, 5, day, 10).getTime(), ...over });
  await add(2, 340, 'Swiggy', { tags: ['office'] });
  await add(9, 420, 'Swiggy');
  await add(10, 15000, 'Landlord', { categoryKey: 'rent' });
  await add(11, 60000, 'Acme', { type: 'income', categoryKey: 'income' });
  const gone = await add(12, 999, 'Deleted');
  await r.transactions.remove(gone.id);
  await r.transactions.createTransfer({ fromAccountId: 'default-bank', toAccountId: 'default-cash', amountPaise: 2000_00, occurredAt: new Date(2026, 5, 13).getTime() });
  await r.budgets.set(null, 30000_00);
  await r.goals.add({ name: 'Trip', targetPaise: 20000_00, deadline: null });
  return ctx;
}

describe('repositoryLedger', () => {
  it('answers the assistant tools from the real database', async () => {
    const { repos } = await seeded();
    const ledger = repositoryLedger(repos);
    const summary = (await runTool('get_summary', { period: 'this_month' }, ledger, NOW)).result;
    expect(summary).toMatchObject({ spending: '₹15,760', income: '₹60,000' });

    const found = (await runTool('search_transactions', { text: 'office', category: null, type: null, period: null, from_date: null, to_date: null, min_amount_rupees: null, max_amount_rupees: null, limit: 5 }, ledger, NOW)).result;
    expect(found).toMatchObject({ match_count: 1, total: '₹340' });

    const budgets = (await runTool('budget_status', {}, ledger, NOW)).result;
    expect(budgets.budgets).toEqual([expect.objectContaining({ spent: '₹15,760', left: '₹14,240' })]);
    expect((await runTool('goals_status', {}, ledger, NOW)).result.goals).toEqual([expect.objectContaining({ goal: 'Trip' })]);
  });

  it('pages through more rows than one page holds', async () => {
    const { repos } = await createTestContext(NOW);
    for (let i = 0; i < 1200; i++) {
      await repos.transactions.insert({ amountPaise: 100, type: 'expense', categoryKey: 'food', payeeName: `P${i}`, paymentMethod: 'cash', verifiedBy: 'manual', occurredAt: NOW - i * 60_000 });
    }
    expect(await repositoryLedger(repos).transactions(0, NOW + 1)).toHaveLength(1200);
  });

  it('reads payday only when set', async () => {
    const { repos } = await createTestContext(NOW);
    expect(await repositoryLedger(repos).payday()).toBeNull();
    await repos.settings.set('payday', 25);
    expect(await repositoryLedger(repos).payday()).toBe(25);
  });
});

describe('applyProposal', () => {
  it('saves a confirmed transaction marked as from the assistant', async () => {
    const { repos } = await createTestContext(NOW);
    await applyProposal(repos, { kind: 'transaction', amountPaise: 25_000, type: 'expense', payeeName: 'Canteen', categoryKey: 'food', occurredAt: NOW, note: 'Lunch' });
    const [t] = (await repos.transactions.list({}, 5)).items;
    expect(t).toMatchObject({ amountPaise: 25_000, payeeName: 'Canteen', source: 'ai', verifiedBy: 'user', note: 'Lunch' });
  });

  it('saves a confirmed goal', async () => {
    const { repos } = await createTestContext(NOW);
    await applyProposal(repos, { kind: 'goal', name: 'Laptop', targetPaise: 50_000_00, deadline: null });
    expect(await repos.goals.list()).toEqual([expect.objectContaining({ name: 'Laptop', targetPaise: 50_000_00 })]);
  });
});
