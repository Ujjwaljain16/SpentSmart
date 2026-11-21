import { sha256 } from '@noble/hashes/sha2';
import { Collection } from '@spentsmart/sync-core/contracts';
import { Fields, RecordState } from '@spentsmart/sync-core/merge';
import { SqlExecutor, SqlValue } from '@/db/driver';

/**
 * How each synced table maps to a record. Only columns that mean something on every phone are synced: local
 * bookkeeping (created/updated times, the edit counter, payment attempt links) stays on the device.
 */
export interface CollectionSpec {
  collection: Collection;
  table: string;
  id: string;
  columns: readonly string[];
  /** Values for local-only NOT NULL columns when a record first arrives from another phone. */
  localOnInsert: (now: number) => Record<string, SqlValue>;
  /** Column whose non-null value means "deleted" (soft delete). Without one, a deleted record is removed. */
  deletedColumn?: string;
  tags?: boolean;
}

export const COLLECTION_SPECS: readonly CollectionSpec[] = [
  {
    collection: 'accounts',
    table: 'accounts',
    id: 'id',
    columns: ['name', 'type', 'opening_balance_paise', 'sort_order', 'archived_at'],
    localOnInsert: (now) => ({ created_at: now }),
  },
  {
    collection: 'categories',
    table: 'categories',
    id: 'key',
    columns: ['label', 'icon', 'color', 'sort_order', 'is_system'],
    localOnInsert: () => ({}),
  },
  {
    collection: 'budgets',
    table: 'budgets',
    id: 'id',
    columns: ['category_key', 'limit_paise', 'rollover', 'archived_at'],
    localOnInsert: (now) => ({ created_at: now }),
  },
  {
    collection: 'goals',
    table: 'goals',
    id: 'id',
    columns: ['name', 'target_paise', 'saved_paise', 'deadline', 'archived_at'],
    localOnInsert: (now) => ({ created_at: now }),
  },
  {
    collection: 'transactions',
    table: 'transactions',
    id: 'id',
    columns: [
      'amount_paise', 'type', 'category_key', 'payee_name', 'payee_vpa', 'payment_method', 'note', 'occurred_at',
      'deleted_at', 'verified_by', 'upi_txn_id', 'upi_txn_ref', 'account_id', 'source', 'transfer_id', 'transfer_role',
    ],
    localOnInsert: (now) => ({ created_at: now, updated_at: now }),
    deletedColumn: 'deleted_at',
    tags: true,
  },
];

export const specFor = (collection: string) => COLLECTION_SPECS.find((s) => s.collection === collection);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server record ids must be UUIDs. Most local ids already are; category keys ("food") and the two starting accounts
 * aren't, so they get a stable UUID derived from the key. Every phone derives the same one, which is what makes the
 * default "Food" category on two phones the same record.
 */
export function recordIdFor(collection: string, localId: string): string {
  if (UUID.test(localId)) return localId.toLowerCase();
  const h = sha256(new TextEncoder().encode(`spentsmart/${collection}/${localId}`));
  const hex = [...h.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Shaped as a version 8 (custom) UUID so it passes standard validation.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The record as it is on this phone right now, or null when the row doesn't exist. */
export async function readLocal(db: SqlExecutor, spec: CollectionSpec, localId: string): Promise<RecordState | null> {
  const row = await db.first<Record<string, SqlValue>>(`SELECT ${spec.columns.join(', ')} FROM ${spec.table} WHERE ${spec.id} = ?`, [localId]);
  if (!row) return null;
  const fields: Fields = { _id: localId };
  for (const c of spec.columns) fields[c] = row[c] ?? null;
  if (spec.tags) {
    const tags = await db.all<{ tag: string }>('SELECT tag FROM transaction_tags WHERE transaction_id = ? ORDER BY tag', [localId]);
    fields.tags = tags.map((t) => t.tag);
  }
  return { deleted: spec.deletedColumn ? row[spec.deletedColumn] !== null : false, fields };
}

/**
 * Write a record from another phone. Runs with sync_meta.applying set, so the change isn't queued for upload again.
 * Returns ids of other local rows that had to change as a consequence and therefore do need uploading.
 */
export async function applyRemote(db: SqlExecutor, spec: CollectionSpec, localId: string, state: RecordState, now: number): Promise<string[]> {
  if (state.deleted && !spec.deletedColumn) {
    await db.run(`DELETE FROM ${spec.table} WHERE ${spec.id} = ?`, [localId]);
    return [];
  }
  const columns = spec.columns.filter((c) => c in state.fields);
  const values = columns.map((c) => (state.fields[c] ?? null) as SqlValue);
  if (spec.deletedColumn && state.deleted && state.fields[spec.deletedColumn] == null) {
    const i = columns.indexOf(spec.deletedColumn);
    if (i === -1) {
      columns.push(spec.deletedColumn);
      values.push(now);
    } else values[i] = now;
  }

  const touched: string[] = [];
  // Only one active budget per category. A budget set on this phone and not uploaded yet is the newest intent, so
  // it stays and the incoming one is archived; otherwise the incoming one replaces the local one. Either archive is
  // uploaded, so every phone ends with the same single budget.
  if (spec.table === 'budgets' && state.fields.archived_at == null) {
    const clash = await db.all<{ id: string; dirty: number }>(
      `SELECT b.id, EXISTS (SELECT 1 FROM sync_outbox o WHERE o.collection = 'budgets' AND o.local_id = b.id) AS dirty
       FROM budgets b WHERE b.archived_at IS NULL AND COALESCE(b.category_key, '') = COALESCE(?, '') AND b.id != ?`,
      [(state.fields.category_key ?? null) as SqlValue, localId],
    );
    if (clash.some((c) => c.dirty)) {
      const i = columns.indexOf('archived_at');
      if (i === -1) {
        columns.push('archived_at');
        values.push(now);
      } else values[i] = now;
      touched.push(localId);
    } else {
      for (const c of clash) {
        await db.run('UPDATE budgets SET archived_at = ? WHERE id = ?', [now, c.id]);
        touched.push(c.id);
      }
    }
  }

  const extra = spec.localOnInsert(now);
  const insertCols = [spec.id, ...columns, ...Object.keys(extra)];
  const insertVals = [localId, ...values, ...Object.values(extra)];
  const updates = columns.map((c) => `${c} = excluded.${c}`);
  if (spec.table === 'transactions') updates.push('updated_at = excluded.updated_at');
  await db.run(
    `INSERT INTO ${spec.table} (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})
     ON CONFLICT (${spec.id}) DO ${updates.length > 0 ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`,
    insertVals,
  );

  if (spec.tags && Array.isArray(state.fields.tags)) {
    await db.run('DELETE FROM transaction_tags WHERE transaction_id = ?', [localId]);
    for (const tag of state.fields.tags as string[]) {
      await db.run('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag) VALUES (?, ?)', [localId, tag]);
    }
  }
  return touched;
}
