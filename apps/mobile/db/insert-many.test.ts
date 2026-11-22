import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/tests/helpers/node-driver';

const row = (i: number, over: Record<string, unknown> = {}) => ({
  amountPaise: 100 + i,
  type: 'expense' as const,
  categoryKey: 'food',
  payeeName: `Payee ${i}`,
  paymentMethod: 'upi' as const,
  verifiedBy: 'manual' as const,
  occurredAt: 1_790_000_000_000 + i * 60_000,
  source: 'import' as const,
  ...over,
});

describe('insertMany (bulk import path)', () => {
  it('inserts many rows with tags, queues each for sync, and notifies once', async () => {
    const { repos, driver, notifications } = await createTestContext();
    const before = notifications.count;
    const n = await repos.transactions.insertMany(Array.from({ length: 123 }, (_, i) => row(i, i === 7 ? { tags: ['Goa', 'trip'] } : {})));
    expect(n).toBe(123);
    expect(await repos.transactions.count()).toBe(123);
    expect((await repos.transactions.list({ tag: 'goa' }, 5)).items.map((t) => t.payeeName)).toEqual(['Payee 7']);
    const queued = await driver.first<{ n: number }>("SELECT count(*) AS n FROM sync_outbox WHERE collection = 'transactions'");
    expect(queued!.n).toBe(123);
    expect(notifications.count - before).toBe(1);
  });

  it('keeps payment-attempt rows idempotent', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insertMany([row(1, { attemptId: 'a1' }), row(2)]);
    expect(await repos.transactions.insertMany([row(1, { attemptId: 'a1' })])).toBe(0);
    expect(await repos.transactions.count()).toBe(2);
  });

  it('is all or nothing: one bad row or archived account saves nothing', async () => {
    const { repos } = await createTestContext();
    await expect(repos.transactions.insertMany([row(1), row(2, { amountPaise: -1 })])).rejects.toThrow();
    await expect(repos.transactions.insertMany([row(1), row(2, { accountId: 'no-such-account' })])).rejects.toThrow();
    expect(await repos.transactions.count()).toBe(0);
  });
});
