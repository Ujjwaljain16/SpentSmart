import { randomUUID, webcrypto } from 'node:crypto';
import { generateKey } from '@spentsmart/sync-core/crypto';
import { PullResponse, PushResult, TokenResponse } from '@spentsmart/sync-core/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../api/tests/helpers';
import { createTestContext, TestContext } from '@/tests/helpers/node-driver';
import { createSyncEngine, SyncEngine, SyncTransport } from './engine';

/**
 * The Phase 5 gate in-process: two phones, each with its own encrypted-at-rest database, syncing through the real
 * API (on PGlite). Phones go "offline" simply by not calling sync.
 */
const random = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));

let api: Awaited<ReturnType<typeof createTestApp>>;

interface Phone {
  ctx: TestContext;
  engine: SyncEngine;
  tokens: TokenResponse;
  offline: boolean;
}

function transportFor(phone: { tokens: TokenResponse; offline: boolean }): SyncTransport {
  const headers = () => ({ authorization: `Bearer ${phone.tokens.accessToken}` });
  return {
    async push(ops) {
      if (phone.offline) throw new Error('offline');
      const res = await api.app.inject({ method: 'POST', url: '/v1/sync/push', headers: headers(), payload: { ops } });
      if (res.statusCode !== 200) throw new Error(`push ${res.statusCode} ${res.body}`);
      return res.json().results as PushResult[];
    },
    async pull(cursor, limit) {
      if (phone.offline) throw new Error('offline');
      const res = await api.app.inject({ method: 'GET', url: `/v1/sync/pull?cursor=${cursor}&limit=${limit}`, headers: headers() });
      if (res.statusCode !== 200) throw new Error(`pull ${res.statusCode} ${res.body}`);
      return res.json() as PullResponse;
    },
  };
}

async function phone(name: string, dataKey: Uint8Array): Promise<Phone> {
  const ctx = await createTestContext();
  const tokens = await api.signIn('same-google-account', name);
  const p = { ctx, tokens, offline: false } as Phone;
  p.engine = createSyncEngine(ctx.driver, transportFor(p), { userId: tokens.userId, dataKey }, { now: () => ctx.clock.now, newId: () => randomUUID(), random, notify: () => undefined });
  return p;
}

const tx = (over: Record<string, unknown> = {}) => ({
  amountPaise: 10_000,
  type: 'expense' as const,
  categoryKey: 'food',
  payeeName: 'Cafe',
  paymentMethod: 'upi' as const,
  verifiedBy: 'manual' as const,
  occurredAt: Date.UTC(2026, 5, 16),
  ...over,
});

const allTx = async (p: Phone) => (await p.ctx.repos.transactions.list({}, 500)).items.map((t) => ({ id: t.id, payee: t.payeeName, amount: t.amountPaise, note: t.note, tags: t.tags })).sort((a, b) => a.id.localeCompare(b.id));

let dataKey: Uint8Array;
let a: Phone;
let b: Phone;

beforeEach(async () => {
  api = await createTestApp();
  dataKey = generateKey(random);
  a = await phone('A', dataKey);
  b = await phone('B', dataKey);
});
afterEach(() => api.close());

describe('two phones', () => {
  it('first sync: identical default categories and accounts merge into one set, no conflicts', async () => {
    const ra = await a.engine.syncOnce();
    const rb = await b.engine.syncOnce();
    expect(ra.conflicts + rb.conflicts).toBe(0);
    expect(await a.ctx.repos.categories.list()).toEqual(await b.ctx.repos.categories.list());
    expect((await a.ctx.repos.accounts.list()).map((x) => x.id)).toEqual((await b.ctx.repos.accounts.list()).map((x) => x.id));
    // Nothing left to upload once both agree.
    expect((await b.engine.syncOnce()).pushed).toBe(0);
    expect((await a.engine.syncOnce()).pushed).toBe(0);
  });

  it('offline edits on both phones end up on both, with no duplicates', async () => {
    a.offline = b.offline = true;
    for (let i = 0; i < 30; i++) await a.ctx.repos.transactions.insert(tx({ payeeName: `A${i}`, tags: i % 2 ? ['work'] : [] }));
    for (let i = 0; i < 20; i++) await b.ctx.repos.transactions.insert(tx({ payeeName: `B${i}`, amountPaise: 500 + i }));
    await expect(a.engine.syncOnce()).rejects.toThrow('offline');

    a.offline = b.offline = false;
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    await a.engine.syncOnce();

    const onA = await allTx(a);
    expect(onA).toHaveLength(50);
    expect(onA).toEqual(await allTx(b));
    expect(new Set(onA.map((t) => t.id)).size).toBe(50);
    expect(onA.find((t) => t.payee === 'A1')?.tags).toEqual(['work']);
  });

  it('a dropped push retried later does not create duplicates', async () => {
    await a.engine.syncOnce();
    await a.ctx.repos.transactions.insert(tx({ payeeName: 'Once' }));
    // The server applies the push but the reply is lost on the way back.
    const realPush = transportFor(a).push;
    let dropped = false;
    const flaky = createSyncEngine(a.ctx.driver, {
      push: async (ops) => {
        const r = await realPush(ops);
        if (!dropped) {
          dropped = true;
          throw new Error('connection reset');
        }
        return r;
      },
      pull: transportFor(a).pull,
    }, { userId: a.tokens.userId, dataKey }, { now: () => a.ctx.clock.now, newId: () => randomUUID(), random, notify: () => undefined });
    await expect(flaky.syncOnce()).rejects.toThrow('connection reset');
    await flaky.syncOnce();
    await b.engine.syncOnce();
    expect((await allTx(b)).filter((t) => t.payee === 'Once')).toHaveLength(1);
  });

  describe('edits to the same transaction', () => {
    let id: string;
    beforeEach(async () => {
      id = (await a.ctx.repos.transactions.insert(tx({ payeeName: 'Shared', note: 'start' }))).id;
      await a.engine.syncOnce();
      await b.engine.syncOnce();
    });

    it('different fields merge cleanly', async () => {
      await a.ctx.repos.transactions.update(id, { amountPaise: 25_000 });
      await b.ctx.repos.transactions.update(id, { note: 'from B' });
      await a.engine.syncOnce();
      const rb = await b.engine.syncOnce();
      await a.engine.syncOnce();
      expect(rb.conflicts).toBe(0);
      for (const p of [a, b]) expect((await allTx(p)).find((t) => t.id === id)).toMatchObject({ amount: 25_000, note: 'from B' });
    });

    it('the same field changed on both is surfaced as a conflict, and both phones converge', async () => {
      await a.ctx.repos.transactions.update(id, { amountPaise: 30_000 });
      await b.ctx.repos.transactions.update(id, { amountPaise: 40_000 });
      await a.engine.syncOnce();
      await b.engine.syncOnce();
      await a.engine.syncOnce();

      const conflicts = await b.engine.openConflicts();
      expect(conflicts).toEqual([expect.objectContaining({ collection: 'transactions', local_id: id, field: 'amount_paise', local_json: '40000', remote_json: '30000' })]);
      // B's value was kept and synced; both phones agree.
      for (const p of [a, b]) expect((await allTx(p)).find((t) => t.id === id)?.amount).toBe(40_000);

      await b.engine.resolveConflict(conflicts[0]!.id, 'use-theirs');
      await b.engine.syncOnce();
      await a.engine.syncOnce();
      expect(await b.engine.openConflicts()).toEqual([]);
      for (const p of [a, b]) expect((await allTx(p)).find((t) => t.id === id)?.amount).toBe(30_000);
    });

    it('a delete on one phone reaches the other', async () => {
      await a.ctx.repos.transactions.remove(id);
      await a.engine.syncOnce();
      await b.engine.syncOnce();
      expect((await allTx(b)).find((t) => t.id === id)).toBeUndefined();
    });

    it('deleted on one phone while edited on the other keeps the edit and reports it', async () => {
      await a.ctx.repos.transactions.remove(id);
      await b.ctx.repos.transactions.update(id, { note: 'still needed' });
      await a.engine.syncOnce();
      await b.engine.syncOnce();
      await a.engine.syncOnce();
      expect((await b.engine.openConflicts()).map((c) => c.field)).toEqual(['_deleted']);
      for (const p of [a, b]) expect((await allTx(p)).find((t) => t.id === id)?.note).toBe('still needed');
    });
  });

  it('transfers, accounts, budgets and goals sync too', async () => {
    const wallet = await a.ctx.repos.accounts.add({ name: 'Paytm', type: 'wallet', openingBalancePaise: 1_000_00 });
    await a.ctx.repos.transactions.createTransfer({ fromAccountId: 'default-bank', toAccountId: wallet.id, amountPaise: 500_00 });
    await a.ctx.repos.budgets.set(null, 20_000_00, true);
    const goal = await a.ctx.repos.goals.add({ name: 'Trip', targetPaise: 30_000_00 });
    await a.ctx.repos.goals.contribute(goal.id, 2_000_00);
    await a.engine.syncOnce();
    await b.engine.syncOnce();

    const accountsB = await b.ctx.repos.accounts.list();
    expect(accountsB.find((x) => x.id === wallet.id)).toMatchObject({ name: 'Paytm', balancePaise: 1_500_00 });
    expect((await b.ctx.repos.budgets.listActive())).toEqual([expect.objectContaining({ categoryKey: null, limitPaise: 20_000_00, rollover: true })]);
    expect((await b.ctx.repos.goals.list())[0]).toMatchObject({ name: 'Trip', savedPaise: 2_000_00 });
  });

  it('two phones each setting a monthly budget offline end with one active budget', async () => {
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    await a.ctx.repos.budgets.set(null, 10_000_00);
    await b.ctx.repos.budgets.set(null, 15_000_00);
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    await a.engine.syncOnce();
    for (const p of [a, b]) {
      const active = await p.ctx.repos.budgets.listActive();
      expect(active).toHaveLength(1);
      expect(active[0]!.limitPaise).toBe(15_000_00);
    }
  });

  it('a phone with the wrong data key cannot read anything and changes nothing', async () => {
    await a.ctx.repos.transactions.insert(tx({ payeeName: 'Secret' }));
    await a.engine.syncOnce();
    const intruder = await phone('C', generateKey(random));
    const before = await allTx(intruder);
    await expect(intruder.engine.syncOnce()).rejects.toThrow();
    expect(await allTx(intruder)).toEqual(before);
  });

  it('wiping a phone does not delete anything on the server', async () => {
    await a.ctx.repos.transactions.insert(tx({ payeeName: 'Keep me' }));
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    await b.ctx.repos.eraseEverything();
    await a.engine.syncOnce();
    expect((await allTx(a)).map((t) => t.payee)).toContain('Keep me');
  });
});
