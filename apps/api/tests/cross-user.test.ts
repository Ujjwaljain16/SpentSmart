import { TokenResponse } from '@spentsmart/sync-core/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asUser } from '../src/db';
import { createTestApp, op } from './helpers';

/**
 * One user trying to reach another's data. Every attempt must fail closed: no data, no changes, no hint that the
 * other user's rows exist.
 */
let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: TokenResponse;
let mallory: TokenResponse;
let aliceRecord: ReturnType<typeof op>;

beforeEach(async () => {
  t = await createTestApp();
  alice = await t.signIn('alice');
  mallory = await t.signIn('mallory');
  aliceRecord = op(alice.userId);
  await t.app.inject({ method: 'POST', url: '/v1/sync/push', headers: t.authed(alice), payload: { ops: [aliceRecord] } });
  await t.app.inject({ method: 'PUT', url: '/v1/keys', headers: t.authed(alice), payload: { wrappedKey: 'QUxJQ0VLRVk=' } });
});
afterEach(() => t.close());

const aliceRows = async () => (await t.db.query<{ version: number; ciphertext: string }>('SELECT version, ciphertext FROM records WHERE user_id = $1', [alice.userId])).rows;

describe('cross-user access', () => {
  it('pull never returns another user’s records', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/sync/pull?cursor=0', headers: t.authed(mallory) });
    expect(res.json().records).toEqual([]);
  });

  it('pushing to another user’s record id creates a separate record in your own space', async () => {
    const attack = op(mallory.userId, { recordId: aliceRecord.recordId, baseVersion: 1 });
    const res = await t.app.inject({ method: 'POST', url: '/v1/sync/push', headers: t.authed(mallory), payload: { ops: [attack] } });
    // Version 1 doesn't exist in Mallory's space, so it's a conflict; Alice's row is untouched.
    expect(res.json().results[0]).toMatchObject({ status: 'conflict', currentVersion: 0 });
    expect(await aliceRows()).toEqual([{ version: 1, ciphertext: aliceRecord.ciphertext }]);
  });

  it('reusing another user’s op id does not replay their result', async () => {
    const attack = op(mallory.userId, { opId: aliceRecord.opId });
    const res = await t.app.inject({ method: 'POST', url: '/v1/sync/push', headers: t.authed(mallory), payload: { ops: [attack] } });
    expect(res.json().results[0]).toMatchObject({ status: 'applied', version: 1 });
    expect(await aliceRows()).toHaveLength(1);
  });

  it('cannot read or replace another user’s wrapped key', async () => {
    const get = await t.app.inject({ method: 'GET', url: '/v1/keys', headers: t.authed(mallory) });
    expect(get.json().wrappedKey).toBeNull();
    await t.app.inject({ method: 'PUT', url: '/v1/keys', headers: t.authed(mallory), payload: { wrappedKey: 'TUFMTE9SWQ==' } });
    const { rows } = await t.db.query<{ wrapped_key: string }>('SELECT wrapped_key FROM users WHERE id = $1', [alice.userId]);
    expect(rows[0]!.wrapped_key).toBe('QUxJQ0VLRVk=');
  });

  it('cannot sign out or even see another user’s devices', async () => {
    const list = (await t.app.inject({ method: 'GET', url: '/v1/devices', headers: t.authed(mallory) })).json().devices;
    expect(list.map((d: { id: string }) => d.id)).toEqual([mallory.deviceId]);
    const del = await t.app.inject({ method: 'DELETE', url: `/v1/devices/${alice.deviceId}`, headers: t.authed(mallory) });
    expect(del.statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/v1/sync/pull', headers: t.authed(alice) })).statusCode).toBe(200);
  });

  it('deleting your account leaves other users alone', async () => {
    await t.app.inject({ method: 'DELETE', url: '/v1/account', headers: t.authed(mallory) });
    expect(await aliceRows()).toHaveLength(1);
  });

  it('a forged access token with another user id is rejected', async () => {
    const { SignJWT } = await import('jose');
    const forged = await new SignJWT({ did: mallory.deviceId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(alice.userId)
      .setIssuer('spentsmart-api')
      .setAudience('spentsmart-app')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('guessed-secret-guessed-secret-guessed-secret'));
    expect((await t.app.inject({ method: 'GET', url: '/v1/sync/pull', headers: { authorization: `Bearer ${forged}` } })).statusCode).toBe(401);
  });

  it('a validly signed token pairing one user with another user’s device is rejected', async () => {
    const { signAccessToken } = await import('../src/auth/tokens');
    const { testConfig } = await import('./helpers');
    const mixed = await signAccessToken(testConfig, { userId: alice.userId, deviceId: mallory.deviceId });
    expect((await t.app.inject({ method: 'GET', url: '/v1/sync/pull', headers: { authorization: `Bearer ${mixed}` } })).statusCode).toBe(401);
  });

  it('row-level security blocks a query that forgets its WHERE clause', async () => {
    // Simulates a bug in a handler: an unscoped SELECT and UPDATE running as Mallory.
    const seen = await asUser(t.db, mallory.userId, (tx) => tx.query('SELECT * FROM records'));
    expect(seen.rows).toEqual([]);
    await asUser(t.db, mallory.userId, (tx) => tx.query(`UPDATE records SET ciphertext = 'AAAA'`));
    expect((await aliceRows())[0]!.ciphertext).toBe(aliceRecord.ciphertext);
    await expect(
      asUser(t.db, mallory.userId, (tx) =>
        tx.query(`INSERT INTO records (user_id, collection, record_id, version, deleted, ciphertext, key_version, seq) VALUES ($1, 'transactions', gen_random_uuid(), 1, false, 'AAAA', 1, 99)`, [alice.userId]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('with no user set, the RLS role sees nothing', async () => {
    const rows = await t.db.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE spentsmart_app');
      return (await tx.query('SELECT * FROM records')).rows;
    });
    expect(rows).toEqual([]);
  });
});
