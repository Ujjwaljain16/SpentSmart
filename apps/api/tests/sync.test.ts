import { randomUUID } from 'node:crypto';
import { decryptRecord, encryptRecord, formatRecoveryKey, generateKey, parseRecoveryKey, unwrapDataKey, wrapDataKey } from '@spentsmart/sync-core/crypto';
import { PushOp, TokenResponse } from '@spentsmart/sync-core/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, op, random } from './helpers';

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(() => t.close());

const pushOps = (tokens: TokenResponse, ops: PushOp[]) => t.app.inject({ method: 'POST', url: '/v1/sync/push', headers: t.authed(tokens), payload: { ops } });
const pullFrom = (tokens: TokenResponse, cursor = 0, limit?: number) =>
  t.app.inject({ method: 'GET', url: `/v1/sync/pull?cursor=${cursor}${limit ? `&limit=${limit}` : ''}`, headers: t.authed(tokens) });

describe('push and pull', () => {
  it('stores a new record at version 1 and another device pulls it', async () => {
    const a = await t.signIn('g1', 'A');
    const b = await t.signIn('g1', 'B');
    const o = op(a.userId);
    const res = await pushOps(a, [o]);
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([{ opId: o.opId, status: 'applied', version: 1, seq: 1 }]);

    const pulled = (await pullFrom(b)).json();
    expect(pulled).toEqual({
      records: [{ collection: 'transactions', recordId: o.recordId, version: 1, deleted: false, ciphertext: o.ciphertext, keyVersion: 1, seq: 1 }],
      cursor: 1,
      hasMore: false,
    });
    expect((await pullFrom(b, pulled.cursor)).json().records).toEqual([]);
  });

  it('updates only on top of the current version', async () => {
    const a = await t.signIn('g1');
    const first = op(a.userId);
    await pushOps(a, [first]);
    const update = op(a.userId, { recordId: first.recordId, baseVersion: 1 });
    expect((await pushOps(a, [update])).json().results[0]).toMatchObject({ status: 'applied', version: 2 });
    const stale = op(a.userId, { recordId: first.recordId, baseVersion: 1 });
    expect((await pushOps(a, [stale])).json().results[0]).toEqual({ opId: stale.opId, status: 'conflict', currentVersion: 2 });
  });

  it('treats a create for an id that already exists as a conflict', async () => {
    const a = await t.signIn('g1');
    const first = op(a.userId);
    await pushOps(a, [first]);
    const dup = op(a.userId, { recordId: first.recordId, baseVersion: 0 });
    expect((await pushOps(a, [dup])).json().results[0]).toMatchObject({ status: 'conflict', currentVersion: 1 });
  });

  it('is idempotent: a retried op returns the first result and changes nothing', async () => {
    const a = await t.signIn('g1');
    const o = op(a.userId);
    const first = (await pushOps(a, [o])).json();
    const again = (await pushOps(a, [o])).json();
    expect(again).toEqual(first);
    expect((await pullFrom(a)).json().records).toHaveLength(1);
    const { rows } = await t.db.query<{ record_seq: string }>('SELECT record_seq FROM users');
    expect(Number(rows[0]!.record_seq)).toBe(1);
  });

  it('a retried op that conflicted still reports the conflict, even after the record moved on', async () => {
    const a = await t.signIn('g1');
    const first = op(a.userId);
    await pushOps(a, [first]);
    const stale = op(a.userId, { recordId: first.recordId, baseVersion: 5 });
    const r1 = (await pushOps(a, [stale])).json();
    await pushOps(a, [op(a.userId, { recordId: first.recordId, baseVersion: 1 })]);
    expect((await pushOps(a, [stale])).json()).toEqual(r1);
  });

  it('keeps deletes as tombstones that other devices pull', async () => {
    const a = await t.signIn('g1');
    const o = op(a.userId);
    await pushOps(a, [o]);
    await pushOps(a, [op(a.userId, { recordId: o.recordId, baseVersion: 1, deleted: true })]);
    const records = (await pullFrom(a)).json().records;
    expect(records).toEqual([expect.objectContaining({ recordId: o.recordId, version: 2, deleted: true })]);
  });

  it('pages in sequence order with a cursor', async () => {
    const a = await t.signIn('g1');
    await pushOps(a, Array.from({ length: 5 }, () => op(a.userId)));
    const p1 = (await pullFrom(a, 0, 2)).json();
    expect(p1.records.map((r: { seq: number }) => r.seq)).toEqual([1, 2]);
    expect(p1.hasMore).toBe(true);
    const p2 = (await pullFrom(a, p1.cursor, 2)).json();
    const p3 = (await pullFrom(a, p2.cursor, 2)).json();
    expect([...p2.records, ...p3.records].map((r: { seq: number }) => r.seq)).toEqual([3, 4, 5]);
    expect(p3.hasMore).toBe(false);
  });

  it('an updated record moves to the end of the change feed instead of appearing twice', async () => {
    const a = await t.signIn('g1');
    const x = op(a.userId);
    const y = op(a.userId);
    await pushOps(a, [x, y]);
    await pushOps(a, [op(a.userId, { recordId: x.recordId, baseVersion: 1 })]);
    const records = (await pullFrom(a)).json().records;
    expect(records.map((r: { recordId: string; seq: number }) => [r.recordId, r.seq])).toEqual([[y.recordId, 2], [x.recordId, 3]]);
  });

  it('validates pushes', async () => {
    const a = await t.signIn('g1');
    const bad = [
      { ...op(a.userId), collection: 'passwords' },
      { ...op(a.userId), recordId: 'not-a-uuid' },
      { ...op(a.userId), baseVersion: -1 },
      { ...op(a.userId), ciphertext: 'not base64!' },
      { ...op(a.userId), ciphertext: 'A'.repeat(70_000) },
    ];
    for (const o of bad) expect((await pushOps(a, [o as PushOp])).statusCode).toBe(400);
    expect((await pushOps(a, [])).statusCode).toBe(400);
    expect((await pushOps(a, Array.from({ length: 201 }, () => op(a.userId)))).statusCode).toBe(400);
  });

  it('stores only ciphertext', async () => {
    const a = await t.signIn('g1');
    await pushOps(a, [op(a.userId, { value: { payeeName: 'Swiggy', amountPaise: 34_000 } })]);
    const dump = JSON.stringify((await t.db.query('SELECT * FROM records')).rows);
    expect(dump).not.toContain('Swiggy');
    expect(dump).not.toContain('34000');
  });
});

describe('recovery key flow', () => {
  it('first phone stores the wrapped key; a new phone unwraps it with the recovery key and reads records', async () => {
    const a = await t.signIn('g1', 'Old phone');
    const dataKey = generateKey(random);
    const recoveryText = formatRecoveryKey(generateKey(random));
    const wrappedKey = wrapDataKey(dataKey, parseRecoveryKey(recoveryText), a.userId, random);
    expect((await t.app.inject({ method: 'PUT', url: '/v1/keys', headers: t.authed(a), payload: { wrappedKey } })).statusCode).toBe(204);

    const recordId = randomUUID();
    const value = { payeeName: 'Rent', amountPaise: 1_200_000 };
    const ciphertext = encryptRecord(dataKey, { userId: a.userId, collection: 'transactions', recordId }, value, random);
    await pushOps(a, [op(a.userId, { recordId, ciphertext })]);

    const b = await t.signIn('g1', 'New phone');
    const fetched = (await t.app.inject({ method: 'GET', url: '/v1/keys', headers: t.authed(b) })).json().wrappedKey;
    const restored = unwrapDataKey(fetched, parseRecoveryKey(recoveryText), b.userId);
    const [record] = (await pullFrom(b)).json().records;
    expect(decryptRecord(restored, { userId: b.userId, collection: 'transactions', recordId }, record.ciphertext)).toEqual(value);
  });

  it('will not overwrite an existing key', async () => {
    const a = await t.signIn('g1');
    const put = (wrappedKey: string) => t.app.inject({ method: 'PUT', url: '/v1/keys', headers: t.authed(a), payload: { wrappedKey } });
    expect((await put('QUFBQUFBQUFBQUFB')).statusCode).toBe(204);
    expect((await put('QkJCQkJCQkJCQkJC')).statusCode).toBe(409);
    expect((await t.app.inject({ method: 'GET', url: '/v1/keys', headers: t.authed(a) })).json().wrappedKey).toBe('QUFBQUFBQUFBQUFB');
  });
});

describe('devices and account deletion', () => {
  it('signing out another device cuts it off', async () => {
    const a = await t.signIn('g1', 'A');
    const b = await t.signIn('g1', 'B');
    expect((await t.app.inject({ method: 'DELETE', url: `/v1/devices/${b.deviceId}`, headers: t.authed(a) })).statusCode).toBe(204);
    expect((await pullFrom(b)).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: b.refreshToken } })).statusCode).toBe(401);
    expect((await pullFrom(a)).statusCode).toBe(200);
  });

  it('deleting the account removes every row the user had', async () => {
    const a = await t.signIn('g1', 'A');
    await t.signIn('g1', 'B');
    await pushOps(a, [op(a.userId), op(a.userId)]);
    await t.app.inject({ method: 'PUT', url: '/v1/keys', headers: t.authed(a), payload: { wrappedKey: 'QUFBQQ==' } });
    const other = await t.signIn('g2');
    await pushOps(other, [op(other.userId)]);

    expect((await t.app.inject({ method: 'DELETE', url: '/v1/account', headers: t.authed(a) })).statusCode).toBe(204);

    for (const table of ['users', 'devices', 'refresh_tokens', 'records', 'applied_ops']) {
      const column = table === 'users' ? 'id' : 'user_id';
      const { rows } = await t.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [a.userId]);
      expect(rows[0]!.n, table).toBe(0);
    }
    expect((await pullFrom(a)).statusCode).toBe(401);
    expect((await pullFrom(other)).json().records).toHaveLength(1);
    // Signing in again starts a fresh, empty account.
    const again = await t.signIn('g1');
    expect(again.userId).not.toBe(a.userId);
    expect((await pullFrom(again)).json().records).toEqual([]);
  });
});
