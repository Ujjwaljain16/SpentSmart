import { TRANSFER_CATEGORY_KEY } from '@spentsmart/finance/categories';
import { isValidPaise } from '@spentsmart/finance/money';
import {
  NewTransaction,
  PAYMENT_METHODS,
  PaymentMethod,
  Transaction,
  TransactionPatch,
  TransactionSource,
  TransactionType,
  TransferRole,
  VerifiedBy,
} from '@spentsmart/finance/types';
import { SqlDriver, SqlExecutor, SqlValue } from '../driver';
import { DEFAULT_BANK_ACCOUNT_ID, DEFAULT_CASH_ACCOUNT_ID } from '../migrations';
import { RepoDeps } from './deps';

interface TransactionRow {
  id: string;
  amount_paise: number;
  type: TransactionType;
  category_key: string;
  payee_name: string;
  payee_vpa: string | null;
  payment_method: PaymentMethod;
  note: string | null;
  occurred_at: number;
  created_at: number;
  verified_by: VerifiedBy;
  upi_txn_id: string | null;
  upi_txn_ref: string | null;
  attempt_id: string | null;
  account_id: string;
  source: TransactionSource;
  version: number;
  transfer_id: string | null;
  transfer_role: TransferRole | null;
  tags: string | null;
}

const TAG_SEPARATOR = '\u001f';

/** Every read goes through this: live rows only, tags folded into one column. */
const SELECT_TRANSACTION = `
  SELECT t.*, (SELECT group_concat(g.tag, char(31)) FROM transaction_tags g WHERE g.transaction_id = t.id) AS tags
  FROM transactions t`;

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    amountPaise: row.amount_paise,
    type: row.type,
    categoryKey: row.category_key,
    payeeName: row.payee_name,
    payeeVpa: row.payee_vpa,
    paymentMethod: row.payment_method,
    note: row.note,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    verifiedBy: row.verified_by,
    upiTxnId: row.upi_txn_id,
    upiTxnRef: row.upi_txn_ref,
    attemptId: row.attempt_id,
    accountId: row.account_id,
    source: row.source,
    version: row.version,
    transferId: row.transfer_id,
    transferRole: row.transfer_role,
    tags: row.tags ? row.tags.split(TAG_SEPARATOR).sort() : [],
  };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface TransactionFilter {
  search?: string;
  categoryKey?: string;
  type?: TransactionType;
  accountId?: string;
  tag?: string;
  /** Inclusive lower bound on occurredAt. */
  since?: number | null;
  /** Exclusive upper bound on occurredAt. */
  until?: number | null;
}

export interface TransactionCursor {
  occurredAt: number;
  id: string;
}

export interface TransactionPage {
  items: Transaction[];
  nextCursor: TransactionCursor | null;
}

export interface FilterSummary {
  count: number;
  /** Net effect on balances in paise. Transfers between two included accounts cancel out. */
  netPaise: number;
}

export interface NewTransfer {
  fromAccountId: string;
  toAccountId: string;
  amountPaise: number;
  note?: string | null;
  occurredAt?: number;
}

export interface Revision {
  version: number;
  changedAt: number;
  snapshot: Transaction;
}

const MAX_TEXT = 200;
const MAX_TAGS = 10;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function cleanTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return [];
  const out = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
    if (tag) out.add(tag);
  }
  if (out.size > MAX_TAGS) throw new ValidationError(`At most ${MAX_TAGS} tags.`);
  return [...out];
}

export const BALANCE_EFFECT_SQL = `CASE type
  WHEN 'income' THEN amount_paise
  WHEN 'refund' THEN amount_paise
  WHEN 'expense' THEN -amount_paise
  WHEN 'transfer' THEN CASE transfer_role WHEN 'in' THEN amount_paise ELSE -amount_paise END
END`;

function buildWhere(filter: TransactionFilter): { clauses: string[]; params: SqlValue[] } {
  const clauses = ['t.deleted_at IS NULL'];
  const params: SqlValue[] = [];

  if (filter.categoryKey) {
    clauses.push('t.category_key = ?');
    params.push(filter.categoryKey);
  }
  if (filter.type) {
    clauses.push('t.type = ?');
    params.push(filter.type);
  }
  if (filter.accountId) {
    clauses.push('t.account_id = ?');
    params.push(filter.accountId);
  }
  if (filter.tag) {
    clauses.push('EXISTS (SELECT 1 FROM transaction_tags g WHERE g.transaction_id = t.id AND g.tag = ?)');
    params.push(filter.tag.toLowerCase());
  }
  if (filter.since != null) {
    clauses.push('t.occurred_at >= ?');
    params.push(filter.since);
  }
  if (filter.until != null) {
    clauses.push('t.occurred_at < ?');
    params.push(filter.until);
  }
  const search = filter.search?.trim();
  if (search) {
    const like = `%${escapeLike(search.toLowerCase())}%`;
    clauses.push(
      `(lower(t.payee_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(t.note, '')) LIKE ? ESCAPE '\\' ` +
        `OR lower(COALESCE(t.payee_vpa, '')) LIKE ? ESCAPE '\\' OR lower(t.category_key) LIKE ? ESCAPE '\\' ` +
        `OR EXISTS (SELECT 1 FROM transaction_tags g WHERE g.transaction_id = t.id AND g.tag LIKE ? ESCAPE '\\'))`,
    );
    params.push(like, like, like, like, like);
  }
  return { clauses, params };
}

function validateNew(input: NewTransaction): void {
  if (!isValidPaise(input.amountPaise)) throw new ValidationError('Amount must be a positive whole number of paise within limits.');
  if (input.type !== 'income' && input.type !== 'expense' && input.type !== 'refund') {
    throw new ValidationError('Invalid transaction type.');
  }
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) throw new ValidationError('Invalid payment method.');
  if (!input.payeeName.trim()) throw new ValidationError('A name is required.');
  if (!input.categoryKey) throw new ValidationError('A category is required.');
  if (input.categoryKey === TRANSFER_CATEGORY_KEY) throw new ValidationError('Use a transfer to move money between accounts.');
}

type AnyExecutor = SqlExecutor | SqlDriver;

function atomically<T>(db: AnyExecutor, fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
  return 'transaction' in db ? db.transaction(fn) : fn(db);
}

export function createTransactionsRepo(db: AnyExecutor, deps: RepoDeps) {
  const { now, newId, notify } = deps;

  async function readRow(executor: SqlExecutor, id: string, includeDeleted = false): Promise<TransactionRow | null> {
    return executor.first<TransactionRow>(
      `${SELECT_TRANSACTION} WHERE t.id = ?${includeDeleted ? '' : ' AND t.deleted_at IS NULL'}`,
      [id],
    );
  }

  async function getById(id: string): Promise<Transaction | null> {
    const row = await readRow(db, id);
    return row ? mapTransaction(row) : null;
  }

  async function assertAccount(executor: SqlExecutor, accountId: string): Promise<void> {
    const row = await executor.first<{ archived_at: number | null }>('SELECT archived_at FROM accounts WHERE id = ?', [accountId]);
    if (!row) throw new ValidationError('That account does not exist.');
    if (row.archived_at !== null) throw new ValidationError('That account is archived.');
  }

  async function writeTags(executor: SqlExecutor, id: string, tags: string[]): Promise<void> {
    await executor.run('DELETE FROM transaction_tags WHERE transaction_id = ?', [id]);
    for (const tag of tags) {
      await executor.run('INSERT INTO transaction_tags (transaction_id, tag) VALUES (?, ?)', [id, tag]);
    }
  }

  async function snapshot(executor: SqlExecutor, row: TransactionRow): Promise<void> {
    await executor.run('INSERT INTO transaction_revisions (transaction_id, version, snapshot, changed_at) VALUES (?, ?, ?, ?)', [
      row.id,
      row.version,
      JSON.stringify(mapTransaction(row)),
      now(),
    ]);
  }

  /** Both legs of one transfer inside an open transaction. Returns the out and in leg ids. */
  async function transferIn(tx: SqlExecutor, input: NewTransfer, transferId: string): Promise<string[]> {
    if (!isValidPaise(input.amountPaise)) throw new ValidationError('Invalid amount.');
    if (input.fromAccountId === input.toAccountId) throw new ValidationError('Choose two different accounts.');
    await assertAccount(tx, input.fromAccountId);
    await assertAccount(tx, input.toAccountId);
    const names = await tx.all<{ id: string; name: string }>('SELECT id, name FROM accounts WHERE id IN (?, ?)', [
      input.fromAccountId,
      input.toAccountId,
    ]);
    const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? 'account';
    const t = now();
    const legs: Array<{ id: string; role: TransferRole; account: string; label: string }> = [
      { id: newId(), role: 'out', account: input.fromAccountId, label: `To ${nameOf(input.toAccountId)}` },
      { id: newId(), role: 'in', account: input.toAccountId, label: `From ${nameOf(input.fromAccountId)}` },
    ];
    for (const leg of legs) {
      await tx.run(
        `INSERT INTO transactions
           (id, amount_paise, type, category_key, payee_name, payment_method, note, occurred_at, created_at, updated_at,
            verified_by, account_id, source, version, transfer_id, transfer_role)
         VALUES (?, ?, 'transfer', ?, ?, 'bank', ?, ?, ?, ?, 'manual', ?, 'manual', 1, ?, ?)`,
        [
          leg.id,
          input.amountPaise,
          TRANSFER_CATEGORY_KEY,
          leg.label,
          input.note?.trim().slice(0, MAX_TEXT) || null,
          input.occurredAt ?? t,
          t,
          t,
          leg.account,
          transferId,
          leg.role,
        ],
      );
    }
    return legs.map((l) => l.id);
  }

  /** One insert inside an open transaction; idempotent on attempt id. */
  async function insertIn(tx: SqlExecutor, input: NewTransaction): Promise<{ id: string; created: boolean }> {
    validateNew(input);
    const tags = cleanTags(input.tags);
    const accountId = input.accountId ?? (input.paymentMethod === 'cash' ? DEFAULT_CASH_ACCOUNT_ID : DEFAULT_BANK_ACCOUNT_ID);

    if (input.attemptId) {
      const existing = await tx.first<{ id: string }>('SELECT id FROM transactions WHERE attempt_id = ?', [input.attemptId]);
      if (existing) return { id: existing.id, created: false };
    }
    await assertAccount(tx, accountId);
    const id = newId();
    const t = now();
    await tx.run(
      `INSERT INTO transactions
         (id, amount_paise, type, category_key, payee_name, payee_vpa, payment_method, note, occurred_at, created_at,
          updated_at, verified_by, upi_txn_id, upi_txn_ref, attempt_id, account_id, source, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        input.amountPaise,
        input.type,
        input.categoryKey,
        input.payeeName.trim().slice(0, MAX_TEXT),
        input.payeeVpa ?? null,
        input.paymentMethod,
        input.note?.trim().slice(0, MAX_TEXT) || null,
        input.occurredAt ?? t,
        t,
        t,
        input.verifiedBy,
        input.upiTxnId ?? null,
        input.upiTxnRef ?? null,
        input.attemptId ?? null,
        accountId,
        input.source ?? (input.attemptId ? 'scan' : 'manual'),
      ],
    );
    await writeTags(tx, id, tags);
    return { id, created: true };
  }

  return {
    getById,

    /**
     * Insert an expense, income or refund. When `attemptId` is given the insert is idempotent: a second call for
     * the same payment attempt returns the existing row instead of creating a duplicate.
     */
    async insert(input: NewTransaction): Promise<Transaction> {
      const result = await atomically(db, (tx) => insertIn(tx, input));

      const row = await readRow(db, result.id, true);
      if (!row) throw new Error('Failed to read back inserted transaction.');
      if (result.created) notify();
      return mapTransaction(row);
    },

    /** Move money between two of the user's accounts. Stored as two linked rows; never counts as spending. */
    /** Many inserts (and transfers) as one all-or-nothing transaction, with a single change notification. */
    async insertMany(inputs: readonly NewTransaction[], transfers: readonly NewTransfer[] = []): Promise<number> {
      if (inputs.length === 0 && transfers.length === 0) return 0;
      const created = await atomically(db, async (tx) => {
        let n = 0;
        for (const input of inputs) if ((await insertIn(tx, input)).created) n++;
        for (const t of transfers) {
          await transferIn(tx, t, newId());
          n++;
        }
        return n;
      });
      notify();
      return created;
    },

    async createTransfer(input: NewTransfer): Promise<{ transferId: string; out: Transaction; in: Transaction }> {
      const transferId = newId();
      const ids = await atomically(db, (tx) => transferIn(tx, input, transferId));

      notify();
      const [outRow, inRow] = await Promise.all([readRow(db, ids[0]!), readRow(db, ids[1]!)]);
      return { transferId, out: mapTransaction(outRow!), in: mapTransaction(inRow!) };
    },

    /** Edit a transaction. The previous state is kept as a revision and the version goes up by one. */
    async update(id: string, patch: TransactionPatch): Promise<boolean> {
      const sets: string[] = [];
      const params: SqlValue[] = [];

      if (patch.amountPaise !== undefined) {
        if (!isValidPaise(patch.amountPaise)) throw new ValidationError('Invalid amount.');
        sets.push('amount_paise = ?');
        params.push(patch.amountPaise);
      }
      if (patch.type !== undefined) {
        if (patch.type !== 'income' && patch.type !== 'expense' && patch.type !== 'refund') {
          throw new ValidationError('Invalid transaction type.');
        }
        sets.push('type = ?');
        params.push(patch.type);
      }
      if (patch.categoryKey !== undefined) {
        if (patch.categoryKey === TRANSFER_CATEGORY_KEY) throw new ValidationError('Use a transfer to move money between accounts.');
        sets.push('category_key = ?');
        params.push(patch.categoryKey);
      }
      if (patch.payeeName !== undefined) {
        if (!patch.payeeName.trim()) throw new ValidationError('A name is required.');
        sets.push('payee_name = ?');
        params.push(patch.payeeName.trim().slice(0, MAX_TEXT));
      }
      if (patch.paymentMethod !== undefined) {
        if (!PAYMENT_METHODS.includes(patch.paymentMethod)) throw new ValidationError('Invalid payment method.');
        sets.push('payment_method = ?');
        params.push(patch.paymentMethod);
      }
      if (patch.note !== undefined) {
        sets.push('note = ?');
        params.push(patch.note?.trim().slice(0, MAX_TEXT) || null);
      }
      if (patch.occurredAt !== undefined) {
        sets.push('occurred_at = ?');
        params.push(patch.occurredAt);
      }
      if (patch.accountId !== undefined) {
        sets.push('account_id = ?');
        params.push(patch.accountId);
      }
      const tags = patch.tags !== undefined ? cleanTags(patch.tags) : undefined;
      if (sets.length === 0 && tags === undefined) return (await getById(id)) !== null;

      const changed = await atomically(db, async (tx) => {
        const row = await readRow(tx, id);
        if (!row) return false;
        if (row.type === 'transfer') throw new ValidationError('Edit transfers from the transfer itself.');
        if (patch.accountId !== undefined) await assertAccount(tx, patch.accountId);
        await snapshot(tx, row);
        await tx.run(`UPDATE transactions SET ${[...sets, 'version = version + 1', 'updated_at = ?'].join(', ')} WHERE id = ?`, [
          ...params,
          now(),
          id,
        ]);
        if (tags !== undefined) await writeTags(tx, id, tags);
        return true;
      });
      if (changed) notify();
      return changed;
    },

    /** Soft delete. Both legs of a transfer go together. The row stays for history and sync. */
    async remove(id: string): Promise<boolean> {
      const removed = await atomically(db, async (tx) => {
        const row = await readRow(tx, id);
        if (!row) return false;
        const t = now();
        if (row.transfer_id) {
          await tx.run(
            'UPDATE transactions SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE transfer_id = ? AND deleted_at IS NULL',
            [t, t, row.transfer_id],
          );
        } else {
          await tx.run('UPDATE transactions SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?', [t, t, id]);
        }
        return true;
      });
      if (removed) notify();
      return removed;
    },

    /** Undo a soft delete (e.g. from an "Undo" toast). */
    async restore(id: string): Promise<boolean> {
      const restored = await atomically(db, async (tx) => {
        const row = await readRow(tx, id, true);
        if (!row) return false;
        const t = now();
        const result = row.transfer_id
          ? await tx.run('UPDATE transactions SET deleted_at = NULL, updated_at = ?, version = version + 1 WHERE transfer_id = ?', [t, row.transfer_id])
          : await tx.run('UPDATE transactions SET deleted_at = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NOT NULL', [t, id]);
        return result.changes > 0;
      });
      if (restored) notify();
      return restored;
    },

    async revisions(id: string): Promise<Revision[]> {
      const rows = await db.all<{ version: number; changed_at: number; snapshot: string }>(
        'SELECT version, changed_at, snapshot FROM transaction_revisions WHERE transaction_id = ? ORDER BY version ASC',
        [id],
      );
      return rows.map((r) => ({ version: r.version, changedAt: r.changed_at, snapshot: JSON.parse(r.snapshot) as Transaction }));
    },

    /** Keyset-paginated listing, newest first. Stable under inserts and O(page) regardless of table size. */
    async list(filter: TransactionFilter = {}, limit = 50, cursor: TransactionCursor | null = null): Promise<TransactionPage> {
      const { clauses, params } = buildWhere(filter);
      if (cursor) {
        clauses.push('(t.occurred_at < ? OR (t.occurred_at = ? AND t.id < ?))');
        params.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
      }
      const rows = await db.all<TransactionRow>(
        `${SELECT_TRANSACTION} WHERE ${clauses.join(' AND ')} ORDER BY t.occurred_at DESC, t.id DESC LIMIT ?`,
        [...params, limit + 1],
      );
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(mapTransaction);
      const last = items[items.length - 1];
      return { items, nextCursor: hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null };
    },

    async summarize(filter: TransactionFilter = {}): Promise<FilterSummary> {
      const { clauses, params } = buildWhere(filter);
      const row = await db.first<{ c: number; net: number | null }>(
        `SELECT COUNT(*) AS c, SUM(${BALANCE_EFFECT_SQL.replace(/\b(type|amount_paise|transfer_role)\b/g, 't.$1')}) AS net
         FROM transactions t WHERE ${clauses.join(' AND ')}`,
        params,
      );
      return { count: row?.c ?? 0, netPaise: row?.net ?? 0 };
    },

    async count(): Promise<number> {
      const row = await db.first<{ c: number }>('SELECT COUNT(*) AS c FROM transactions WHERE deleted_at IS NULL');
      return row?.c ?? 0;
    },

    /** Permanently removes every transaction. Only for "Delete all data". */
    async removeAll(): Promise<void> {
      await atomically(db, async (tx) => {
        await tx.run('DELETE FROM transaction_tags');
        await tx.run('DELETE FROM transaction_revisions');
        await tx.run('DELETE FROM transactions');
      });
      notify();
    },
  };
}

export type TransactionsRepo = ReturnType<typeof createTransactionsRepo>;
