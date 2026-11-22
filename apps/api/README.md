# SpentSmart sync API

Fastify + Postgres. Google sign-in, devices, storage for end-to-end encrypted records, and a narrow proxy for the
assistant. The server never sees amounts, payees, notes, categories or dates; see
[ADR 0001](../../docs/adr/0001-end-to-end-encrypted-sync.md).

- **Isolation:** every table has row-level security. Requests run as the `spentsmart_app` role with
  `SET LOCAL app.user_id`, so even a query bug can't read another user's rows.
- **Auth:** Google ID tokens verified against `GOOGLE_CLIENT_IDS`; 15-minute access tokens; rotating refresh tokens,
  where reusing an old one revokes the whole chain.
- **Sync:** compare-and-set push with per-op idempotency keys (`applied_ops`), cursor-based pull.
- **Limits:** 300 requests a minute overall, 20 a minute on sign-in routes, 30 assistant turns a minute per user.

## Run the tests

```
pnpm --filter @spentsmart/api test
```

Tests run against PGlite (Postgres in WebAssembly): no Docker, no database to start.

## Run it locally

Needs a Postgres database (local or a free Neon project).

| Variable | Example |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host/db?sslmode=require` |
| `GOOGLE_CLIENT_IDS` | the Android and web OAuth client ids, comma-separated |
| `ACCESS_TOKEN_SECRET` | at least 32 random characters |
| `DATABASE_URL_UNPOOLED` | direct connection for migrations (optional, Neon) |
| `PORT` / `HOST` | `3000` / `0.0.0.0` (optional) |
| `ASSISTANT_MODE` | unset (assistant off, its route doesn't exist), `claude`, or `fake` (local only) |
| `ANTHROPIC_API_KEY` | required when `ASSISTANT_MODE=claude` |
| `TEST_SIGN_IN` | `true` enables sign-in by name for local testing; the server refuses to start with it in production |

```
pnpm --filter @spentsmart/api dev
```

No database at hand? `pnpm --filter @spentsmart/api dev:local` starts the API on `127.0.0.1:3000` with an
in-process Postgres (PGlite), test sign-in and the fake assistant model. That's what the emulator dev loop and the
Maestro sync/assistant flows use.

Migrations in `migrations/` run on start-up (or with `pnpm --filter @spentsmart/api migrate`). When
`DATABASE_URL_UNPOOLED` is set (Neon), migrations use that direct connection and requests use the pooled `DATABASE_URL`.

### Against Neon

The repo is linked to a Neon project (`neon.ts`, `.neon`). `neon deploy` (or `neon env pull`) in the repo root writes
`DATABASE_URL` and `DATABASE_URL_UNPOOLED` to `.env.local`, then:

```
pnpm --filter @spentsmart/api dev:neon
```

starts the API on `127.0.0.1:3100` against that database with test sign-in on. Local testing only.

## Deploy (Render)

Live at `https://spentsmart.onrender.com`. The database is Neon in AWS Singapore, and the server runs in Render's
Singapore region too: each request makes several database calls, so the two must be close.

- Web service from this repo: build `corepack enable && pnpm install --frozen-lockfile`, start
  `pnpm --filter @spentsmart/api start`, health check `/healthz`.
- Environment: `DATABASE_URL` (Neon pooled), `DATABASE_URL_UNPOOLED` (Neon direct, for migrations),
  `ACCESS_TOKEN_SECRET` (48+ random characters), `GOOGLE_CLIENT_IDS` (the Google **web** client id, which is the
  audience of the ID tokens the app sends), `NODE_ENV=production`, `NODE_VERSION=22`. Never set `TEST_SIGN_IN`; the
  server refuses to start with it in production.
- Migrations run on start-up. The free plan sleeps after about 15 idle minutes, so the first request after that is slow.
- The app's `preview` and `production` EAS profiles point at this URL (`EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json`).

Quick checks after a deploy: `/healthz` returns `{"ok":true}`, `/v1/config` shows `"testSignIn":false`, and
`/v1/sync/pull` without a token returns 401.

## Endpoints

| Method | Path | |
|---|---|---|
| POST | `/v1/auth/google` | `{ idToken, deviceName }` → access + refresh token |
| POST | `/v1/auth/refresh` | rotates the refresh token; reuse revokes the chain |
| POST | `/v1/auth/logout` | signs out this device |
| GET / PUT | `/v1/keys` | the wrapped data key (set once) |
| POST | `/v1/sync/push` | compare-and-set ops with idempotency keys |
| GET | `/v1/sync/pull?cursor=` | changes after the cursor |
| GET / DELETE | `/v1/devices[/:id]` | list / sign out a device |
| DELETE | `/v1/account` | deletes the user and everything they own |
| GET | `/v1/config` | `{ testSignIn, assistant }`: which optional features this server has |
| POST | `/v1/auth/test` | `{ name, deviceName }` → tokens; only when `TEST_SIGN_IN=true` |
| POST | `/v1/assistant/turn` | one assistant turn; the server fixes model, prompt and tools; only when `ASSISTANT_MODE` is set |
| GET | `/healthz` | |
