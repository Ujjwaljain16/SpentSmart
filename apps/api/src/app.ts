import { randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import {
  googleSignInRequest,
  testSignInRequest,
  keyEnvelopeRequest,
  pullQuery,
  pushRequest,
  refreshRequest,
  TokenResponse,
} from '@spentsmart/sync-core/contracts';
import Fastify, { FastifyRequest } from 'fastify';
import { ZodError, ZodTypeAny, z } from 'zod';
import { CreateTurn, UpstreamError, perUserLimit, turnRequest } from './assistant';
import { GoogleVerifier, InvalidGoogleTokenError } from './auth/google';
import { AuthError, Session, issueRefreshToken, rotateRefreshToken, signAccessToken, verifyAccessToken } from './auth/tokens';
import { Config } from './config';
import { Db, asUser } from './db';
import { pull, push } from './sync';

export interface AppDeps {
  db: Db;
  config: Config;
  verifyGoogle: GoogleVerifier;
  /** Requests per minute per client, overall and for sign-in routes. Lowered in tests. */
  rateLimits?: { global: number; auth: number };
  logger?: boolean;
  /** Model access for the assistant. Without it (the default) the assistant routes don't exist. */
  assistant?: { createTurn: CreateTurn; turnsPerMinute?: number };
}

declare module 'fastify' {
  interface FastifyRequest {
    session: Session;
  }
}

export async function buildApp({ db, config, verifyGoogle, rateLimits = { global: 300, auth: 20 }, logger = false, assistant }: AppDeps) {
  const app = Fastify({
    logger: logger ? { redact: ['req.headers.authorization', 'req.body.idToken', 'req.body.refreshToken'] } : false,
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });
  await app.register(rateLimit, { max: rateLimits.global, timeWindow: '1 minute' });

  const parse = <S extends ZodTypeAny>(schema: S, value: unknown): z.output<S> => schema.parse(value);

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) return reply.status(400).send({ error: 'invalid_request', issues: error.issues.map((i) => i.path.join('.')) });
    if (error instanceof AuthError || error instanceof InvalidGoogleTokenError) return reply.status(401).send({ error: 'unauthorized' });
    if (error instanceof UpstreamError) return reply.status(error.status).send({ error: 'assistant_unavailable', message: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ error: 'rate_limited' });
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: 'bad_request' });
    app.log.error(error);
    return reply.status(500).send({ error: 'server_error' });
  });

  const authLimit = { config: { rateLimit: { max: rateLimits.auth, timeWindow: '1 minute' } } };

  async function tokensFor(session: Session, refreshToken?: string): Promise<TokenResponse> {
    return {
      accessToken: await signAccessToken(config, session),
      refreshToken: refreshToken ?? (await issueRefreshToken(db, config, session)),
      expiresIn: config.accessTokenTtlSeconds,
      userId: session.userId,
      deviceId: session.deviceId,
    };
  }

  /** Every data route: a valid access token for a device that hasn't been signed out. */
  async function authenticate(req: FastifyRequest) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AuthError();
    const session = await verifyAccessToken(config, header.slice(7));
    const live = await asUser(db, session.userId, (tx) =>
      tx.query('SELECT 1 FROM devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [session.deviceId, session.userId]),
    );
    if (live.rows.length === 0) throw new AuthError();
    req.session = session;
  }

  app.get('/healthz', async () => ({ ok: true }));

  /** Find or create the user for an identity and register a new device for them. */
  async function signInAs(identity: { sub: string; email: string | null }, deviceName: string): Promise<Session> {
    return db.transaction(async (tx) => {
      const existing = await tx.query<{ id: string }>('SELECT id FROM users WHERE google_sub = $1', [identity.sub]);
      let userId = existing.rows[0]?.id;
      if (!userId) {
        userId = randomUUID();
        await tx.query('INSERT INTO users (id, google_sub, email) VALUES ($1, $2, $3)', [userId, identity.sub, identity.email]);
      } else {
        await tx.query('UPDATE users SET email = $2 WHERE id = $1', [userId, identity.email]);
      }
      const deviceId = randomUUID();
      await tx.query('INSERT INTO devices (id, user_id, name) VALUES ($1, $2, $3)', [deviceId, userId, deviceName]);
      return { userId, deviceId };
    });
  }

  app.get('/v1/config', async () => ({ testSignIn: config.testSignIn === true, assistant: assistant !== undefined }));

  if (config.testSignIn) {
    // Local testing only (see Config.testSignIn). Test users live in their own "test:" namespace.
    app.post('/v1/auth/test', authLimit, async (req) => {
      const body = parse(testSignInRequest, req.body);
      return tokensFor(await signInAs({ sub: `test:${body.name.toLowerCase()}`, email: null }, body.deviceName));
    });
  }

  app.post('/v1/auth/google', authLimit, async (req) => {
    const body = parse(googleSignInRequest, req.body);
    const identity = await verifyGoogle(body.idToken);
    // Sign-in runs before we know the user, so it is the one place that looks users up without the RLS role.
    const session = await signInAs(identity, body.deviceName);
    return tokensFor(session);
  });

  app.post('/v1/auth/refresh', authLimit, async (req) => {
    const { refreshToken } = parse(refreshRequest, req.body);
    const rotated = await rotateRefreshToken(db, config, refreshToken);
    return tokensFor(rotated.session, rotated.refreshToken);
  });

  app.register(async (authed) => {
    authed.addHook('preHandler', authenticate);

    authed.post('/v1/auth/logout', async (req, reply) => {
      await asUser(db, req.session.userId, async (tx) => {
        await tx.query('UPDATE devices SET revoked_at = now() WHERE id = $1 AND user_id = $2', [req.session.deviceId, req.session.userId]);
        await tx.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE device_id = $1', [req.session.deviceId]);
      });
      return reply.status(204).send();
    });

    authed.get('/v1/keys', async (req) => {
      const { rows } = await asUser(db, req.session.userId, (tx) => tx.query<{ wrapped_key: string | null }>('SELECT wrapped_key FROM users WHERE id = $1', [req.session.userId]));
      return { wrappedKey: rows[0]?.wrapped_key ?? null };
    });

    // Set once, by the first device. Replacing it would let a stolen session lock the user out of their own data.
    authed.put('/v1/keys', async (req, reply) => {
      const { wrappedKey } = parse(keyEnvelopeRequest, req.body);
      const { rows } = await asUser(db, req.session.userId, (tx) =>
        tx.query('UPDATE users SET wrapped_key = $2 WHERE id = $1 AND wrapped_key IS NULL RETURNING id', [req.session.userId, wrappedKey]),
      );
      if (rows.length === 0) return reply.status(409).send({ error: 'key_exists' });
      return reply.status(204).send();
    });

    authed.post('/v1/sync/push', async (req) => {
      const { ops } = parse(pushRequest, req.body);
      return { results: await push(db, req.session, ops) };
    });

    authed.get('/v1/sync/pull', async (req) => {
      const q = parse(pullQuery, req.query);
      return pull(db, req.session, q.cursor, q.limit);
    });

    authed.get('/v1/devices', async (req) => {
      const { rows } = await asUser(db, req.session.userId, (tx) =>
        tx.query<{ id: string; name: string; created_at: Date; last_seen_at: Date }>(
          'SELECT id, name, created_at, last_seen_at FROM devices WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at',
          [req.session.userId],
        ),
      );
      return {
        devices: rows.map((d) => ({ id: d.id, name: d.name, createdAt: d.created_at, lastSeenAt: d.last_seen_at, current: d.id === req.session.deviceId })),
      };
    });

    authed.delete<{ Params: { id: string } }>('/v1/devices/:id', async (req, reply) => {
      const { rows } = await asUser(db, req.session.userId, async (tx) => {
        const r = await tx.query('UPDATE devices SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id', [req.params.id, req.session.userId]);
        if (r.rows.length > 0) await tx.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE device_id = $1', [req.params.id]);
        return r;
      }).catch(() => ({ rows: [] as unknown[] }));
      return reply.status(rows.length > 0 ? 204 : 404).send();
    });

    if (assistant) {
      const allow = perUserLimit(assistant.turnsPerMinute ?? 30, 60_000);
      // One model turn. The phone runs the tools and sends the results back in the next call; conversations are not
      // stored here, and request bodies are never logged.
      authed.post('/v1/assistant/turn', async (req, reply) => {
        if (!allow(req.session.userId)) return reply.status(429).send({ error: 'rate_limited' });
        const { messages } = parse(turnRequest, req.body);
        return assistant.createTurn(messages as never);
      });
    }

    // Deletes the user row; every other table cascades from it.
    authed.delete('/v1/account', async (req, reply) => {
      await asUser(db, req.session.userId, (tx) => tx.query('DELETE FROM users WHERE id = $1', [req.session.userId]));
      return reply.status(204).send();
    });
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
