/**
 * `pnpm --filter @spentsmart/api dev:local`: the API on this laptop for emulator testing. In-process Postgres in
 * `.local-data/`, sign-in by name, and the free fake model for the assistant. Set ASSISTANT_MODE=claude (with
 * ANTHROPIC_API_KEY) to use the real model. Never use this for a deployment.
 */
process.env.DATABASE_URL ??= 'pglite:./.local-data';
process.env.ACCESS_TOKEN_SECRET ??= 'local-testing-secret-not-for-production-use';
process.env.TEST_SIGN_IN ??= 'true';
// The web client id, so real Google sign-in also works against the local API.
process.env.GOOGLE_CLIENT_IDS ??= '99783042621-qf4dik3ts1522e4ts1cd0tmgvegp6b6s.apps.googleusercontent.com';
process.env.ASSISTANT_MODE ??= 'fake';
process.env.PORT ??= '3000';
// Loopback only: test sign-in must not be reachable from the network. The emulator still gets here via 10.0.2.2.
process.env.HOST ??= '127.0.0.1';

await import('./server');

export {};
