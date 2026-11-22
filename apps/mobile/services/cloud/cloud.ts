import { RandomBytes, formatRecoveryKey, generateKey, parseRecoveryKey, unwrapDataKey, wrapDataKey } from '@spentsmart/sync-core/crypto';
import { fromBase64, toBase64 } from '@spentsmart/sync-core/encoding';
import { SqlDriver } from '@/db/driver';
import { SyncReport, createSyncEngine } from '@/services/sync/engine';
import { ApiClient, SecretStore } from './api-client';

const DATA_KEY = 'cloud.dataKey';

export type CloudStatus =
  | { state: 'signed-out' }
  /** Signed in, but this phone has no data key yet: create one (first phone) or restore it (next phones). */
  | { state: 'needs-key'; firstDevice: boolean; userId: string }
  | { state: 'ready'; userId: string; lastSyncedAt: number | null };

/**
 * Everything "Sync & backup" does, in one place: where the phone stands, setting up or restoring the data key, and
 * running a sync. Screens call these; nothing here touches React.
 */
export function createCloud(opts: { client: ApiClient; store: SecretStore; db: SqlDriver; random: RandomBytes; now: () => number; newId: () => string; notify: () => void }) {
  const { client, store, db } = opts;

  async function dataKey(): Promise<Uint8Array | null> {
    const k = await store.get(DATA_KEY);
    return k ? fromBase64(k) : null;
  }

  async function lastSyncedAt(): Promise<number | null> {
    const row = await db.first<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'lastSyncedAt'");
    return row ? Number(row.value) : null;
  }

  let running: Promise<SyncReport> | null = null;

  return {
    async status(): Promise<CloudStatus> {
      const session = await client.session();
      if (!session) return { state: 'signed-out' };
      if (await dataKey()) return { state: 'ready', userId: session.userId, lastSyncedAt: await lastSyncedAt() };
      const { wrappedKey } = await client.getKey();
      return { state: 'needs-key', firstDevice: wrappedKey === null, userId: session.userId };
    },

    /** First phone: make the data key, upload it wrapped, and return the recovery key for the user to write down. */
    async createKey(): Promise<string> {
      const session = await client.session();
      if (!session) throw new Error('Sign in first.');
      const key = generateKey(opts.random);
      const recovery = generateKey(opts.random);
      await client.putKey(wrapDataKey(key, recovery, session.userId, opts.random));
      await store.set(DATA_KEY, toBase64(key));
      return formatRecoveryKey(recovery);
    },

    /** Next phone: unwrap the data key with the recovery key the user typed. Throws on typos or a wrong key. */
    async restoreKey(recoveryText: string): Promise<void> {
      const session = await client.session();
      if (!session) throw new Error('Sign in first.');
      const { wrappedKey } = await client.getKey();
      if (!wrappedKey) throw new Error('No backup to restore yet.');
      const key = unwrapDataKey(wrappedKey, parseRecoveryKey(recoveryText), session.userId);
      await store.set(DATA_KEY, toBase64(key));
    },

    /** One sync. Calls made while one is running share it. */
    async syncNow(): Promise<SyncReport> {
      running ??= (async () => {
        const session = await client.session();
        const key = await dataKey();
        if (!session || !key) throw new Error('Sync isn’t set up on this phone.');
        const engine = createSyncEngine(db, { push: client.push, pull: client.pull }, { userId: session.userId, dataKey: key }, opts);
        const report = await engine.syncOnce();
        await db.run("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncedAt', ?)", [String(opts.now())]);
        return report;
      })().finally(() => {
        running = null;
      });
      return running;
    },

    async conflicts() {
      const key = await dataKey();
      const session = await client.session();
      if (!key || !session) return [];
      return createSyncEngine(db, { push: client.push, pull: client.pull }, { userId: session.userId, dataKey: key }, opts).openConflicts();
    },

    async resolveConflict(id: number, choice: 'keep-mine' | 'use-theirs') {
      const key = await dataKey();
      const session = await client.session();
      if (!key || !session) return;
      await createSyncEngine(db, { push: client.push, pull: client.pull }, { userId: session.userId, dataKey: key }, opts).resolveConflict(id, choice);
    },

    /**
     * Stop syncing on this phone. The data stays on the phone; the sync bookkeeping is cleared so signing in again
     * starts clean.
     */
    async signOut(alsoDeleteCloudData = false): Promise<void> {
      if (alsoDeleteCloudData) await client.deleteAccount();
      else await client.signOut();
      await store.delete(DATA_KEY);
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM sync_records');
        await tx.run('DELETE FROM sync_conflicts');
        await tx.run('DELETE FROM sync_meta');
        // Everything local is unsynced again from the next account's point of view.
        for (const [collection, table, id] of [
          ['transactions', 'transactions', 'id'],
          ['accounts', 'accounts', 'id'],
          ['categories', 'categories', 'key'],
          ['budgets', 'budgets', 'id'],
          ['goals', 'goals', 'id'],
        ] as const) {
          await tx.run(`INSERT OR IGNORE INTO sync_outbox (collection, local_id, change_seq) SELECT '${collection}', ${id}, 1 FROM ${table}`);
        }
      });
      opts.notify();
    },
  };
}

export type Cloud = ReturnType<typeof createCloud>;
