import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { Config } from '../config';
import { Db } from '../db';

const ISSUER = 'spentsmart-api';
const AUDIENCE = 'spentsmart-app';

export class AuthError extends Error {
  constructor(message = 'Sign in again.') {
    super(message);
    this.name = 'AuthError';
  }
}

export interface Session {
  userId: string;
  deviceId: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function signAccessToken(config: Config, session: Session): Promise<string> {
  return new SignJWT({ did: session.deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(config.accessTokenSecret);
}

export async function verifyAccessToken(config: Config, token: string): Promise<Session> {
  try {
    const { payload } = await jwtVerify(token, config.accessTokenSecret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.did !== 'string') throw new AuthError();
    return { userId: payload.sub, deviceId: payload.did };
  } catch {
    throw new AuthError();
  }
}

/**
 * Issue a refresh token. These are opaque random strings; only their SHA-256 is stored, so a database leak can't be
 * replayed as sessions.
 */
export async function issueRefreshToken(db: Db, config: Config, session: Session, familyId: string = randomUUID()): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, device_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6))`,
    [randomUUID(), session.userId, session.deviceId, familyId, hash(token), config.refreshTokenTtlDays],
  );
  return token;
}

/**
 * Swap a refresh token for a new one. Each token works once. Presenting one that was already used means it was
 * copied, so every token from that sign-in is revoked and both copies have to sign in again.
 */
export async function rotateRefreshToken(db: Db, config: Config, token: string): Promise<{ session: Session; refreshToken: string }> {
  const found = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      user_id: string;
      device_id: string;
      family_id: string;
      used_at: Date | null;
      revoked_at: Date | null;
      expired: boolean;
      device_revoked: boolean;
    }>(
      `SELECT t.id, t.user_id, t.device_id, t.family_id, t.used_at, t.revoked_at, t.expires_at < now() AS expired,
              d.revoked_at IS NOT NULL AS device_revoked
       FROM refresh_tokens t JOIN devices d ON d.id = t.device_id
       WHERE t.token_hash = $1 FOR UPDATE OF t`,
      [hash(token)],
    );
    const row = rows[0];
    if (!row) return { ok: false as const };
    if (row.used_at || row.revoked_at) {
      await tx.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1', [row.family_id]);
      return { ok: false as const };
    }
    if (row.expired || row.device_revoked) return { ok: false as const };
    await tx.query('UPDATE refresh_tokens SET used_at = now() WHERE id = $1', [row.id]);
    await tx.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [row.device_id]);
    return { ok: true as const, session: { userId: row.user_id, deviceId: row.device_id }, familyId: row.family_id };
  });
  if (!found.ok) throw new AuthError();
  return { session: found.session, refreshToken: await issueRefreshToken(db, config, found.session, found.familyId) };
}
