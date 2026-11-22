import { generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(() => t.close());

const google = (idToken: string, deviceName = 'Pixel') => t.app.inject({ method: 'POST', url: '/v1/auth/google', payload: { idToken, deviceName } });
const refresh = (refreshToken: string) => t.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken } });

describe('Google sign-in', () => {
  it('creates a user and a device, and the same Google account maps to the same user', async () => {
    const a = await t.signIn('google-1', 'Phone A');
    const b = await t.signIn('google-1', 'Phone B');
    expect(a.userId).toBe(b.userId);
    expect(a.deviceId).not.toBe(b.deviceId);
    const res = await t.app.inject({ method: 'GET', url: '/v1/devices', headers: t.authed(a) });
    expect(res.json().devices.map((d: { name: string }) => d.name)).toEqual(['Phone A', 'Phone B']);
  });

  it.each([
    ['another app’s client id', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['a different issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { exp: '-10m' }],
  ])('rejects %s', async (_label, opts) => {
    const idToken = await t.google.sign({ sub: 'x' }, opts);
    expect((await google(idToken)).statusCode).toBe(401);
  });

  it('rejects a token signed by someone else', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const idToken = await t.google.sign({ sub: 'x' }, { key: privateKey });
    expect((await google(idToken)).statusCode).toBe(401);
  });

  it('rejects an unverified email', async () => {
    const idToken = await t.google.sign({ sub: 'x', email: 'x@example.com', email_verified: false });
    expect((await google(idToken)).statusCode).toBe(401);
  });

  it('rejects malformed requests', async () => {
    expect((await google('short')).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'POST', url: '/v1/auth/google', payload: { idToken: 'x'.repeat(40) } })).statusCode).toBe(400);
  });
});

describe('access tokens', () => {
  it('protect every data route', async () => {
    for (const [method, url] of [['GET', '/v1/sync/pull'], ['POST', '/v1/sync/push'], ['GET', '/v1/keys'], ['GET', '/v1/devices'], ['DELETE', '/v1/account']] as const) {
      expect((await t.app.inject({ method, url })).statusCode).toBe(401);
      expect((await t.app.inject({ method, url, headers: { authorization: 'Bearer not-a-token' } })).statusCode).toBe(401);
    }
  });

  it('stop working once the device signs out', async () => {
    const a = await t.signIn('google-1');
    expect((await t.app.inject({ method: 'POST', url: '/v1/auth/logout', headers: t.authed(a) })).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: '/v1/keys', headers: t.authed(a) })).statusCode).toBe(401);
    expect((await refresh(a.refreshToken)).statusCode).toBe(401);
  });
});

describe('refresh token rotation', () => {
  it('gives a new pair each time and each refresh token works once', async () => {
    const a = await t.signIn('google-1');
    const r1 = await refresh(a.refreshToken);
    expect(r1.statusCode).toBe(200);
    const next = r1.json();
    expect(next.refreshToken).not.toBe(a.refreshToken);
    expect(next.deviceId).toBe(a.deviceId);
    expect((await refresh(next.refreshToken)).statusCode).toBe(200);
  });

  it('reusing an old token revokes the whole chain, including the newest token', async () => {
    const a = await t.signIn('google-1');
    const stolen = a.refreshToken;
    const legit = (await refresh(stolen)).json();
    expect((await refresh(stolen)).statusCode).toBe(401);
    expect((await refresh(legit.refreshToken)).statusCode).toBe(401);
  });

  it('does not touch other devices when one chain is revoked', async () => {
    const a = await t.signIn('google-1', 'A');
    const b = await t.signIn('google-1', 'B');
    await refresh(a.refreshToken);
    await refresh(a.refreshToken);
    expect((await refresh(b.refreshToken)).statusCode).toBe(200);
  });

  it('stores only hashes of refresh tokens', async () => {
    const a = await t.signIn('google-1');
    const { rows } = await t.db.query<{ token_hash: string }>('SELECT token_hash FROM refresh_tokens');
    expect(rows.map((r) => r.token_hash)).not.toContain(a.refreshToken);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an unknown token', async () => {
    expect((await refresh('x'.repeat(43))).statusCode).toBe(401);
  });
});

describe('rate limits', () => {
  it('limit sign-in attempts', async () => {
    const limited = await createTestApp({ rateLimits: { global: 100, auth: 3 } });
    const idToken = await limited.google.sign({ sub: 'x' });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await limited.app.inject({ method: 'POST', url: '/v1/auth/google', payload: { idToken, deviceName: 'P' } })).statusCode);
    }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    await limited.close();
  });
});
