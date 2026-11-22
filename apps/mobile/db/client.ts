import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { log } from '@/lib/logger';
import { createExpoDriver } from './expo-driver';
import { emitDataChanged } from './events';
import { deleteDatabaseKey, getOrCreateDatabaseKey } from './key';
import { migrate } from './migrations';
import { Repositories, createRepositories } from './repositories';

const DB_NAME = 'spentsmart.db';

export class DatabaseOpenError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseOpenError';
  }
}

let opened: Promise<Repositories> | null = null;

/**
 * Open the encrypted database, migrate it, and return the repositories. Every caller in this JS runtime gets the
 * same connection: Android can recreate the activity (font size, language, split screen) and React then mounts the
 * app again. A second open would hand back expo-sqlite's cached native connection under a new JS handle, and when
 * the old handle is garbage-collected it closes that shared connection, so every later query fails.
 *
 * This function never deletes or rewrites existing data on failure. If the file cannot be opened
 * (wrong key, corruption, newer schema) it throws, and the UI offers an explicit, user-confirmed reset.
 */
export function openRepositories(): Promise<Repositories> {
  opened ??= openOnce().catch((error: unknown) => {
    opened = null;
    throw error;
  });
  return opened;
}

async function openOnce(): Promise<Repositories> {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    const key = await getOrCreateDatabaseKey();
    db = await SQLite.openDatabaseAsync(DB_NAME);

    const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (cipher?.cipher_version) {
      await db.execAsync(`PRAGMA key = "x'${key}'"`);
    } else if (!__DEV__) {
      // Release builds must never silently fall back to an unencrypted database.
      throw new DatabaseOpenError('This build does not include database encryption (SQLCipher).');
    } else {
      log.warn('SQLCipher not available in this build: database is NOT encrypted (development only).');
    }

    await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    // Forces the key to be checked: a wrong key fails here with "file is not a database".
    await db.getFirstAsync('SELECT count(*) AS c FROM sqlite_master');

    const driver = createExpoDriver(db);
    await migrate(driver);

    const repos = createRepositories(driver, {
      now: () => Date.now(),
      newId: () => Crypto.randomUUID(),
      notify: emitDataChanged,
    });
    await repos.attempts.cleanup();
    return repos;
  } catch (error) {
    try {
      await db?.closeAsync();
    } catch {
      /* ignore */
    }
    if (error instanceof DatabaseOpenError) throw error;
    log.error('Failed to open database', error);
    throw new DatabaseOpenError('The local database could not be opened.', error);
  }
}

/** Destructive: delete the database file and its key. Only ever called after explicit user confirmation. */
export async function resetDatabaseFile(): Promise<void> {
  opened = null;
  await SQLite.deleteDatabaseAsync(DB_NAME).catch((e) => log.warn('deleteDatabaseAsync failed', e));
  await deleteDatabaseKey();
}
