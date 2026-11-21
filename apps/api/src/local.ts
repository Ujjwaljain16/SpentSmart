/**
 * `pnpm --filter @spentsmart/api dev:local`: the API on this laptop for emulator testing. In-process Postgres in
 * `.local-data/`, sign-in by name, and the free fake model for the assistant. Set ASSISTANT_MODE=claude (with
 * ANTHROPIC_API_KEY) to use the real model. Never use this for a deployment.
 */
process.env.DATABASE_URL ??= 'pglite:./.local-data';
process.env.ACCESS_TOKEN_SECRET ??= 'local-testing-secret-not-for-production-use';
process.env.TEST_SIGN_IN ??= 'true';
process.env.ASSISTANT_MODE ??= 'fake';
process.env.PORT ??= '3000';

await import('./server');

export {};
