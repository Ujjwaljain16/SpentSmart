import { buildApp } from './app';
import { anthropicTurns } from './assistant';
import { googleVerifier } from './auth/google';
import { loadConfig } from './config';
import { Db, migrate, pgDb } from './db';
import { fakeModel } from './fake-model';

const config = loadConfig();
// `pglite:memory` or `pglite:<folder>` runs Postgres in-process for local testing; anything else is a Postgres URL.
const db: Db = config.databaseUrl.startsWith('pglite:') ? await (await import('./pglite-db')).openPglite(config.databaseUrl) : pgDb(config.databaseUrl);
const applied = await migrate(db);
if (applied.length > 0) console.info(`Applied migrations: ${applied.join(', ')}`);

// The assistant stays off unless enabled. "fake" is the free local stand-in; "claude" reads ANTHROPIC_API_KEY.
const mode = process.env.ASSISTANT_MODE;
if (mode === 'fake' && process.env.NODE_ENV === 'production') throw new Error('ASSISTANT_MODE=fake is for local testing only');
const assistant = mode === 'claude' ? { createTurn: anthropicTurns() } : mode === 'fake' ? { createTurn: fakeModel() } : undefined;

const app = await buildApp({ db, config, verifyGoogle: googleVerifier(config.googleClientIds), logger: true, assistant });
await app.listen({ port: config.port, host: '0.0.0.0' });
if (config.testSignIn) console.warn('TEST SIGN-IN IS ON: anyone who can reach this server can sign in by name. Local testing only.');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => db.close()).then(() => process.exit(0));
  });
}
