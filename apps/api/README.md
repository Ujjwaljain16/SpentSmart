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

Migrations in `migrations/` run on start-up (or with `pnpm --filter @spentsmart/api migrate`).

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
