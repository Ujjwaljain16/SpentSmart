/**
 * `pnpm --filter @spentsmart/api dev:neon`: the API on this laptop against the Neon database, for checking a real
 * Postgres end to end. Reads DATABASE_URL and DATABASE_URL_UNPOOLED from the repo root's `.env.local` (written by
 * `neon deploy` / `neon env pull`), turns on sign-in by name and listens on loopback only. Never use this for a
 * deployment.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
for (const name of ['.env.local', '.env']) {
  const file = join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}
if (!process.env.DATABASE_URL) throw new Error('No DATABASE_URL: run `neon deploy` or `neon env pull` in the repo root first');

process.env.ACCESS_TOKEN_SECRET ??= 'local-testing-secret-not-for-production-use';
process.env.TEST_SIGN_IN ??= 'true';
process.env.PORT ??= '3100';
process.env.HOST ??= '127.0.0.1';

await import('./server');

export {};
