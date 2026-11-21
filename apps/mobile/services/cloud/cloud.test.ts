import { randomUUID, webcrypto } from 'node:crypto';
import { InvalidRecoveryKeyError } from '@spentsmart/sync-core/crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, testConfig } from '../../../api/tests/helpers';
import { createTestContext } from '@/tests/helpers/node-driver';
import { ApiError, SecretStore, createApiClient } from './api-client';
import { createCloud } from './cloud';

/** Two phones talking to the real API over HTTP on localhost, as the app does on an emulator. */
const random = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));
const memoryStore = (): SecretStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v), delete: async (k) => void map.delete(k) };
};

let api: Awaited<ReturnType<typeof createTestApp>>;
let baseUrl: string;

beforeEach(async () => {
  api = await createTestApp({ config: { ...testConfig, testSignIn: true } });
  baseUrl = await api.app.listen({ port: 0, host: '127.0.0.1' });
});
afterEach(() => api.close());

async function phone(store = memoryStore()) {
  const ctx = await createTestContext();
  const client = createApiClient({ baseUrl, store });
  const cloud = createCloud({ client, store, db: ctx.driver, random, now: () => ctx.clock.now, newId: () => randomUUID(), notify: () => undefined });
  return { ctx, client, cloud, store };
}

const spend = (payee: string, amount: number) => ({ amountPaise: amount, type: 'expense' as const, categoryKey: 'food', payeeName: payee, paymentMethod: 'upi' as const, verifiedBy: 'manual' as const });

describe('sync & backup over HTTP', () => {
  it('first phone sets up, second phone restores with the recovery key, both stay in sync', async () => {
    const a = await phone();
    expect(await a.cloud.status()).toEqual({ state: 'signed-out' });
    await a.client.signInForTesting('asha', 'Old phone');
    expect(await a.cloud.status()).toMatchObject({ state: 'needs-key', firstDevice: true });
    const recovery = await a.cloud.createKey();
    expect(recovery).toMatch(/^([0-9A-Z]{4}-){13}[0-9A-Z]{2}$/);
    expect(await a.cloud.status()).toMatchObject({ state: 'ready', lastSyncedAt: null });

    await a.ctx.repos.transactions.insert(spend('Swiggy', 34_000));
    await a.cloud.syncNow();
    expect((await a.cloud.status()) as { lastSyncedAt: number }).toMatchObject({ lastSyncedAt: a.ctx.clock.now });

    const b = await phone();
    await b.client.signInForTesting('asha', 'New phone');
    expect(await b.cloud.status()).toMatchObject({ state: 'needs-key', firstDevice: false });
    await expect(b.cloud.restoreKey(recovery.replace(/^.{4}/, 'ZZZZ'))).rejects.toThrow(InvalidRecoveryKeyError);
    await b.cloud.restoreKey(recovery.toLowerCase());
    await b.cloud.syncNow();
    expect((await b.ctx.repos.transactions.list({}, 10)).items.map((t) => t.payeeName)).toEqual(['Swiggy']);

    await b.ctx.repos.transactions.insert(spend('Chai', 2_000));
    await b.cloud.syncNow();
    await a.cloud.syncNow();
    expect((await a.ctx.repos.transactions.list({}, 10)).items.map((t) => t.payeeName).sort()).toEqual(['Chai', 'Swiggy']);
  });

  it('keeps working after an app restart: the access token is refreshed from the stored refresh token', async () => {
    const a = await phone();
    await a.client.signInForTesting('ravi', 'Phone');
    await a.cloud.createKey();
    // Same stored secrets, fresh client: like reopening the app.
    const reopened = createApiClient({ baseUrl, store: a.store });
    const cloud = createCloud({ client: reopened, store: a.store, db: a.ctx.driver, random, now: () => a.ctx.clock.now, newId: () => randomUUID(), notify: () => undefined });
    await a.ctx.repos.transactions.insert(spend('Uber', 18_000));
    await expect(cloud.syncNow()).resolves.toMatchObject({ pushed: expect.any(Number) });
    // The old refresh token was rotated away.
    expect(a.store.map.get('cloud.refreshToken')).toBeDefined();
  });

  it('being signed out from another phone shows up as signed out here', async () => {
    const a = await phone();
    const b = await phone();
    await a.client.signInForTesting('meera', 'A');
    await a.cloud.createKey();
    await b.client.signInForTesting('meera', 'B');
    const bDevice = (await b.client.session())!.deviceId;
    await a.client.removeDevice(bDevice);
    await expect(b.client.getKey()).rejects.toBeInstanceOf(ApiError);
    expect(await b.cloud.status()).toEqual({ state: 'signed-out' });
  });

  it('signing out keeps the data on the phone and re-queues it for the next account', async () => {
    const a = await phone();
    await a.client.signInForTesting('kiran', 'Phone');
    await a.cloud.createKey();
    await a.ctx.repos.transactions.insert(spend('Zomato', 45_000));
    await a.cloud.syncNow();
    await a.cloud.signOut();
    expect(await a.cloud.status()).toEqual({ state: 'signed-out' });
    expect((await a.ctx.repos.transactions.list({}, 5)).items).toHaveLength(1);
    const queued = await a.ctx.driver.first<{ n: number }>("SELECT count(*) AS n FROM sync_outbox WHERE collection = 'transactions'");
    expect(queued!.n).toBe(1);
  });

  it('deleting cloud data removes it from the server', async () => {
    const a = await phone();
    await a.client.signInForTesting('dev', 'Phone');
    await a.cloud.createKey();
    await a.ctx.repos.transactions.insert(spend('X', 100));
    await a.cloud.syncNow();
    await a.cloud.signOut(true);
    const b = await phone();
    await b.client.signInForTesting('dev', 'Again');
    expect(await b.cloud.status()).toMatchObject({ state: 'needs-key', firstDevice: true });
  });

  it('reports the server being unreachable plainly', async () => {
    const offline = createApiClient({ baseUrl: 'http://127.0.0.1:9', store: memoryStore() });
    await expect(offline.config()).rejects.toMatchObject({ code: 'offline' });
  });
});
