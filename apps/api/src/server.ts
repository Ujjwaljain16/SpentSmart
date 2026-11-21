import { buildApp } from './app';
import { anthropicTurns } from './assistant';
import { googleVerifier } from './auth/google';
import { loadConfig } from './config';
import { migrate, pgDb } from './db';

const config = loadConfig();
const db = pgDb(config.databaseUrl);
const applied = await migrate(db);
if (applied.length > 0) console.info(`Applied migrations: ${applied.join(', ')}`);

// The assistant stays off unless explicitly enabled; the SDK reads ANTHROPIC_API_KEY from the environment.
const assistant = process.env.ASSISTANT_ENABLED === 'true' ? { createTurn: anthropicTurns() } : undefined;
const app = await buildApp({ db, config, verifyGoogle: googleVerifier(config.googleClientIds), logger: true, assistant });
await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => db.close()).then(() => process.exit(0));
  });
}
