# SpentSmart sync API

Google sign-in, devices, and storage for end-to-end encrypted records. The server never sees amounts, payees or
categories; see `docs/adr/0001-end-to-end-encrypted-sync.md`.

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
| `PORT` | `3000` (optional) |

```
pnpm --filter @spentsmart/api dev
```

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
| GET | `/healthz` | |
