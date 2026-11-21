import { RandomBytes, decryptRecord, encryptRecord } from '@spentsmart/sync-core/crypto';
import { PullResponse, PushOp, PushResult } from '@spentsmart/sync-core/contracts';
import { RecordState, mergeRecord } from '@spentsmart/sync-core/merge';
import { SqlDriver, SqlExecutor } from '@/db/driver';
import { COLLECTION_SPECS, CollectionSpec, applyRemote, readLocal, recordIdFor, specFor } from './collections';

/** How the engine talks to the server; the app uses HTTP, tests call the API in-process. */
export interface SyncTransport {
  push(ops: PushOp[]): Promise<PushResult[]>;
  pull(cursor: number, limit: number): Promise<PullResponse>;
}

export interface SyncKeys {
  userId: string;
  dataKey: Uint8Array;
}

export interface SyncDeps {
  now: () => number;
  newId: () => string;
  random: RandomBytes;
  notify: () => void;
}

export interface SyncReport {
  pulled: number;
  pushed: number;
  conflicts: number;
  rounds: number;
}

const PUSH_BATCH = 100;
const PULL_PAGE = 200;
const MAX_ROUNDS = 5;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Base {
  version: number;
  state: RecordState;
}

async function readBase(db: SqlExecutor, collection: string, localId: string): Promise<Base | null> {
  const row = await db.first<{ version: number; base_json: string; deleted: number }>(
    'SELECT version, base_json, deleted FROM sync_records WHERE collection = ? AND local_id = ?',
    [collection, localId],
  );
  return row ? { version: row.version, state: { deleted: row.deleted === 1, fields: JSON.parse(row.base_json) } } : null;
}

async function writeBase(db: SqlExecutor, collection: string, localId: string, version: number, state: RecordState) {
  await db.run(
    `INSERT INTO sync_records (collection, local_id, version, base_json, deleted) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (collection, local_id) DO UPDATE SET version = excluded.version, base_json = excluded.base_json, deleted = excluded.deleted`,
    [collection, localId, version, JSON.stringify(state.fields), state.deleted ? 1 : 0],
  );
}

async function markDirty(db: SqlExecutor, collection: string, localId: string) {
  await db.run(
    `INSERT INTO sync_outbox (collection, local_id, change_seq) VALUES (?, ?, 1)
     ON CONFLICT (collection, local_id) DO UPDATE SET change_seq = change_seq + 1, op_id = NULL`,
    [collection, localId],
  );
}

/** Run `fn` with the change triggers muted, inside one transaction with foreign keys checked at commit. */
async function applying<T>(db: SqlDriver, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('PRAGMA defer_foreign_keys = ON');
    await tx.run("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('applying', '1')");
    try {
      return await fn(tx);
    } finally {
      await tx.run("DELETE FROM sync_meta WHERE key = 'applying'");
    }
  });
}

export function createSyncEngine(db: SqlDriver, transport: SyncTransport, keys: SyncKeys, deps: SyncDeps) {
  const address = (spec: CollectionSpec, localId: string) => ({
    userId: keys.userId,
    collection: spec.collection,
    recordId: recordIdFor(spec.collection, localId),
  });

  async function getCursor(): Promise<number> {
    const row = await db.first<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'cursor'");
    return row ? Number(row.value) : 0;
  }

  /** Download everything newer than the cursor and fold it into the local database. */
  async function pullAll(): Promise<{ pulled: number; conflicts: number }> {
    let pulled = 0;
    let conflicts = 0;
    for (;;) {
      const cursor = await getCursor();
      const page = await transport.pull(cursor, PULL_PAGE);
      // Decrypt before touching the database, so a bad key or tampered record changes nothing.
      const decoded = page.records.flatMap((r) => {
        const spec = specFor(r.collection);
        if (!spec) return [];
        const remote = { deleted: r.deleted, fields: decryptRecord<RecordState['fields']>(keys.dataKey, { userId: keys.userId, collection: r.collection, recordId: r.recordId }, r.ciphertext) };
        const localId = String(remote.fields._id);
        if (recordIdFor(spec.collection, localId) !== r.recordId) throw new Error('Record id does not match its contents');
        return [{ spec, localId, version: r.version, remote }];
      });

      await applying(db, async (tx) => {
        for (const { spec, localId, version, remote } of decoded) {
          const base = await readBase(tx, spec.collection, localId);
          if (base && base.version >= version) continue; // already have it, e.g. our own upload coming back
          const dirty = await tx.first('SELECT 1 FROM sync_outbox WHERE collection = ? AND local_id = ?', [spec.collection, localId]);

          if (!dirty) {
            for (const id of await applyRemote(tx, spec, localId, remote, deps.now())) await markDirty(tx, spec.collection, id);
          } else {
            const local = (await readLocal(tx, spec, localId)) ?? { deleted: true, fields: base?.state.fields ?? remote.fields };
            const result = mergeRecord(base?.state ?? null, local, remote);
            for (const id of await applyRemote(tx, spec, localId, result.merged, deps.now())) await markDirty(tx, spec.collection, id);
            const found = [
              ...result.conflicts.map((c) => ({ field: c.field, local: c.localValue, remote: c.remoteValue })),
              ...(result.deleteConflict ? [{ field: '_deleted', local: result.deleteConflict === 'deleted-locally', remote: result.deleteConflict === 'deleted-remotely' }] : []),
            ];
            for (const c of found) {
              await tx.run('INSERT INTO sync_conflicts (collection, local_id, field, local_json, remote_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
                spec.collection,
                localId,
                c.field,
                JSON.stringify(c.local ?? null),
                JSON.stringify(c.remote ?? null),
                deps.now(),
              ]);
            }
            conflicts += found.length;
            // Nothing left to upload when the merge came out identical to what the server has.
            if (same(result.merged, remote)) await tx.run('DELETE FROM sync_outbox WHERE collection = ? AND local_id = ?', [spec.collection, localId]);
            else await tx.run('UPDATE sync_outbox SET op_id = NULL WHERE collection = ? AND local_id = ?', [spec.collection, localId]);
          }
          await writeBase(tx, spec.collection, localId, version, remote);
          pulled++;
        }
        await tx.run("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('cursor', ?)", [String(page.cursor)]);
      });
      if (!page.hasMore) break;
    }
    return { pulled, conflicts };
  }

  /** Upload local changes. Returns how many were accepted and whether the server had newer versions of any. */
  async function pushAll(): Promise<{ pushed: number; behind: boolean }> {
    let pushed = 0;
    let behind = false;
    const skip = new Set<string>();
    for (;;) {
      const rows = await db.all<{ collection: string; local_id: string; change_seq: number; op_id: string | null }>(
        'SELECT collection, local_id, change_seq, op_id FROM sync_outbox ORDER BY collection, local_id',
      );
      const batch = rows.filter((r) => !skip.has(`${r.collection}/${r.local_id}`)).slice(0, PUSH_BATCH);
      if (batch.length === 0) break;

      const pending: { row: (typeof batch)[number]; spec: CollectionSpec; state: RecordState; op: PushOp }[] = [];
      for (const row of batch) {
        skip.add(`${row.collection}/${row.local_id}`);
        const spec = specFor(row.collection);
        const base = spec ? await readBase(db, row.collection, row.local_id) : null;
        const local = spec ? await readLocal(db, spec, row.local_id) : null;
        const state: RecordState | null = local ?? (base ? { deleted: true, fields: base.state.fields } : null);
        // Nothing to send: unknown collection, created and removed before it ever synced, or no real change.
        if (!spec || !state || (base && same(state, base.state))) {
          await db.run('DELETE FROM sync_outbox WHERE collection = ? AND local_id = ? AND change_seq = ?', [row.collection, row.local_id, row.change_seq]);
          continue;
        }
        // The op id is saved before sending, so a retry after a dropped connection is recognised by the server.
        const opId = row.op_id ?? deps.newId();
        if (!row.op_id) await db.run('UPDATE sync_outbox SET op_id = ? WHERE collection = ? AND local_id = ?', [opId, row.collection, row.local_id]);
        const addr = address(spec, row.local_id);
        pending.push({
          row,
          spec,
          state,
          op: {
            opId,
            collection: spec.collection,
            recordId: addr.recordId,
            baseVersion: base?.version ?? 0,
            deleted: state.deleted,
            ciphertext: encryptRecord(keys.dataKey, addr, state.fields, deps.random),
            keyVersion: 1,
          },
        });
      }
      if (pending.length === 0) continue;

      const results = await transport.push(pending.map((p) => p.op));
      const byOp = new Map(results.map((r) => [r.opId, r]));
      await db.transaction(async (tx) => {
        for (const p of pending) {
          const result = byOp.get(p.op.opId);
          if (!result) continue;
          if (result.status === 'applied') {
            await writeBase(tx, p.spec.collection, p.row.local_id, result.version, p.state);
            // Cleared only if nothing changed while the upload was in flight; otherwise the newer edit goes next round.
            const cleared = await tx.run('DELETE FROM sync_outbox WHERE collection = ? AND local_id = ? AND change_seq = ?', [p.row.collection, p.row.local_id, p.row.change_seq]);
            if (cleared.changes === 0) await tx.run('UPDATE sync_outbox SET op_id = NULL WHERE collection = ? AND local_id = ?', [p.row.collection, p.row.local_id]);
            pushed++;
          } else {
            await tx.run('UPDATE sync_outbox SET op_id = NULL WHERE collection = ? AND local_id = ?', [p.row.collection, p.row.local_id]);
            behind = true;
          }
        }
      });
    }
    return { pushed, behind };
  }

  return {
    /** Pull, merge, push; repeat while another phone keeps winning the race, up to a few rounds. */
    async syncOnce(): Promise<SyncReport> {
      const report: SyncReport = { pulled: 0, pushed: 0, conflicts: 0, rounds: 0 };
      for (let round = 0; round < MAX_ROUNDS; round++) {
        report.rounds++;
        const p = await pullAll();
        report.pulled += p.pulled;
        report.conflicts += p.conflicts;
        const u = await pushAll();
        report.pushed += u.pushed;
        if (!u.behind) break;
      }
      if (report.pulled > 0 || report.conflicts > 0) deps.notify();
      return report;
    },

    async openConflicts() {
      return db.all<{ id: number; collection: string; local_id: string; field: string; local_json: string; remote_json: string; created_at: number }>(
        'SELECT id, collection, local_id, field, local_json, remote_json, created_at FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY created_at, id',
      );
    },

    /** "Use the other phone's value" writes it as a normal local edit, which then syncs to everyone. */
    async resolveConflict(id: number, choice: 'keep-mine' | 'use-theirs'): Promise<void> {
      const c = await db.first<{ collection: string; local_id: string; field: string; remote_json: string }>(
        'SELECT collection, local_id, field, remote_json FROM sync_conflicts WHERE id = ? AND resolved_at IS NULL',
        [id],
      );
      if (!c) return;
      const spec = specFor(c.collection);
      await db.transaction(async (tx) => {
        if (choice === 'use-theirs' && spec && spec.columns.includes(c.field)) {
          await tx.run(`UPDATE ${spec.table} SET ${c.field} = ? WHERE ${spec.id} = ?`, [JSON.parse(c.remote_json), c.local_id]);
        }
        await tx.run('UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?', [deps.now(), id]);
      });
      deps.notify();
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
export { COLLECTION_SPECS };
