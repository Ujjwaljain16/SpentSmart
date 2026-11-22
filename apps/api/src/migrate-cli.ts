import { migrate, pgDb } from './db';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');
const db = pgDb(url);
const applied = await migrate(db);
console.info(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Up to date');
await db.close();
