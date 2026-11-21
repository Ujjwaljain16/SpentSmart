import { buildApp } from './app';
import { googleVerifier } from './auth/google';
import { loadConfig } from './config';
import { migrate, pgDb } from './db';

const config = loadConfig();
const db = pgDb(config.databaseUrl);
const applied = await migrate(db);
if (applied.length > 0) console.info(`Applied migrations: ${applied.join(', ')}`);

const app = await buildApp({ db, config, verifyGoogle: googleVerifier(config.googleClientIds), logger: true });
await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => db.close()).then(() => process.exit(0));
  });
}
