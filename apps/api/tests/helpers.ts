import { randomUUID, webcrypto } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { encryptRecord, generateKey } from '@spentsmart/sync-core/crypto';
import { PushOp, TokenResponse } from '@spentsmart/sync-core/contracts';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { AppDeps, buildApp } from '../src/app';
import { googleVerifier } from '../src/auth/google';
import { Config } from '../src/config';
import { Db, Queryable, migrate } from '../src/db';

export const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';

function pgliteDb(pg: PGlite): Db {
  // PGlite's query() takes one statement; migrations are several, so parameterless SQL goes through exec().
  const run = async <T>(target: PGlite | Parameters<Parameters<PGlite['transaction']>[0]>[0], sql: string, params?: unknown[]) => {
    if (params === undefined) {
      const results = await target.exec(sql);
      return { rows: (results.at(-1)?.rows ?? []) as T[] };
    }
    return { rows: (await target.query<T>(sql, params)).rows };
  };
  return {
    query: (sql, params) => run(pg, sql, params),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (sql, params) => run(tx, sql, params) } as Queryable)),
    close: () => pg.close(),
  };
}

/** A stand-in for Google: signs ID tokens with its own key and hands the API the matching public key. */
export async function fakeGoogle() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; exp?: string; key?: Parameters<SignJWT['sign']>[0] } = {}) =>
    new SignJWT({ email_verified: true, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(opts.iss ?? 'https://accounts.google.com')
      .setAudience(opts.aud ?? GOOGLE_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(opts.key ?? privateKey);
  return { keys, sign };
}

export const testConfig: Config = {
  googleClientIds: [GOOGLE_CLIENT_ID],
  accessTokenSecret: new TextEncoder().encode('test-secret-that-is-long-enough-for-hs256!'),
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 60,
};

export async function createTestApp(opts: { rateLimits?: { global: number; auth: number }; assistant?: AppDeps['assistant'] } = {}) {
  const pg = new PGlite();
  const db = pgliteDb(pg);
  await migrate(db);
  const google = await fakeGoogle();
  const app = await buildApp({ db, config: testConfig, verifyGoogle: googleVerifier(testConfig.googleClientIds, google.keys), rateLimits: opts.rateLimits ?? { global: 10_000, auth: 10_000 }, assistant: opts.assistant });

  async function signIn(sub: string, deviceName = 'Pixel'): Promise<TokenResponse> {
    const idToken = await google.sign({ sub, email: `${sub}@example.com` });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/google', payload: { idToken, deviceName } });
    if (res.statusCode !== 200) throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`);
    return res.json();
  }

  const authed = (tokens: Pick<TokenResponse, 'accessToken'>) => ({ authorization: `Bearer ${tokens.accessToken}` });

  return { app, db, pg, google, signIn, authed, close: async () => { await app.close(); await pg.close(); } };
}

export const random = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));

/** A push op with real ciphertext, as a phone would send it. */
export function op(userId: string, over: Partial<PushOp> & { value?: unknown; dataKey?: Uint8Array } = {}): PushOp {
  const recordId = over.recordId ?? randomUUID();
  const collection = over.collection ?? 'transactions';
  const dataKey = over.dataKey ?? generateKey(random);
  return {
    opId: over.opId ?? randomUUID(),
    collection,
    recordId,
    baseVersion: over.baseVersion ?? 0,
    deleted: over.deleted ?? false,
    keyVersion: 1,
    ciphertext: over.ciphertext ?? encryptRecord(dataKey, { userId, collection, recordId }, over.value ?? { amountPaise: 100 }, random),
  };
}
