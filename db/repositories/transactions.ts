import { isValidPaise } from '@/domain/money';
import {
  NewTransaction,
  PAYMENT_METHODS,
  PaymentMethod,
  Transaction,
  TransactionPatch,
  TransactionType,
  VerifiedBy,
} from '@/domain/types';
import { SqlExecutor, SqlValue } from '../driver';
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
}

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
  /** income minus expense, in paise */
  netPaise: number;
}

const MAX_TEXT = 200;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function buildWhere(filter: TransactionFilter): { where: string; params: SqlValue[] } {
  const clauses: string[] = [];
  const params: SqlValue[] = [];

  if (filter.categoryKey) {
    clauses.push('category_key = ?');
    params.push(filter.categoryKey);
  }
  if (filter.type) {
    clauses.push('type = ?');
    params.push(filter.type);
  }
  if (filter.since != null) {
    clauses.push('occurred_at >= ?');
    params.push(filter.since);
  }
  if (filter.until != null) {
    clauses.push('occurred_at < ?');
    params.push(filter.until);
  }
  const search = filter.search?.trim();
  if (search) {
    const like = `%${escapeLike(search.toLowerCase())}%`;
    clauses.push(
      `(lower(payee_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(note, '')) LIKE ? ESCAPE '\\' ` +
        `OR lower(COALESCE(payee_vpa, '')) LIKE ? ESCAPE '\\' OR lower(category_key) LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function validateNew(input: NewTransaction): void {
  if (!isValidPaise(input.amountPaise)) throw new ValidationError('Amount must be a positive whole number of paise within limits.');
  if (input.type !== 'income' && input.type !== 'expense') throw new ValidationError('Invalid transaction type.');
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) throw new ValidationError('Invalid payment method.');
  if (!input.payeeName.trim()) throw new ValidationError('A name is required.');
  if (!input.categoryKey) throw new ValidationError('A category is required.');
}

export function createTransactionsRepo(db: SqlExecutor, deps: RepoDeps) {
  const { now, newId, notify } = deps;

  async function getById(id: string): Promise<Transaction | null> {
    const row = await db.first<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [id]);
    return row ? mapTransaction(row) : null;
  }

  return {
    getById,

    /**
     * Insert a transaction. When `attemptId` is given the insert is idempotent: a second call for the same
     * attempt returns the existing row instead of creating a duplicate.
     */
    async insert(input: NewTransaction): Promise<Transaction> {
      validateNew(input);
      const id = newId();
      const createdAt = now();
      const result = await db.run(
        `INSERT INTO transactions
           (id, amount_paise, type, category_key, payee_name, payee_vpa, payment_method, note,
            occurred_at, created_at, verified_by, upi_txn_id, upi_txn_ref, attempt_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(attempt_id) DO NOTHING`,
        [
          id,
          input.amountPaise,
          input.type,
          input.categoryKey,
          input.payeeName.trim().slice(0, MAX_TEXT),
          input.payeeVpa ?? null,
          input.paymentMethod,
          input.note?.trim().slice(0, MAX_TEXT) || null,
          input.occurredAt ?? createdAt,
          createdAt,
          input.verifiedBy,
          input.upiTxnId ?? null,
          input.upiTxnRef ?? null,
          input.attemptId ?? null,
        ],
      );

      if (result.changes === 0 && input.attemptId) {
        const existing = await db.first<TransactionRow>('SELECT * FROM transactions WHERE attempt_id = ?', [input.attemptId]);
        if (existing) return mapTransaction(existing);
      }
      const created = await getById(id);
      if (!created) throw new Error('Failed to read back inserted transaction.');
      notify();
      return created;
    },

    async update(id: string, patch: TransactionPatch): Promise<boolean> {
      const sets: string[] = [];
      const params: SqlValue[] = [];

      if (patch.amountPaise !== undefined) {
        if (!isValidPaise(patch.amountPaise)) throw new ValidationError('Invalid amount.');
        sets.push('amount_paise = ?');
        params.push(patch.amountPaise);
      }
      if (patch.type !== undefined) {
        if (patch.type !== 'income' && patch.type !== 'expense') throw new ValidationError('Invalid transaction type.');
        sets.push('type = ?');
        params.push(patch.type);
      }
      if (patch.categoryKey !== undefined) {
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
      if (sets.length === 0) return (await getById(id)) !== null;

      const result = await db.run(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      if (result.changes > 0) notify();
      return result.changes > 0;
    },

    async remove(id: string): Promise<boolean> {
      const result = await db.run('DELETE FROM transactions WHERE id = ?', [id]);
      if (result.changes > 0) notify();
      return result.changes > 0;
    },

    /** Keyset-paginated listing, newest first. Stable under inserts and O(page) regardless of table size. */
    async list(filter: TransactionFilter = {}, limit = 50, cursor: TransactionCursor | null = null): Promise<TransactionPage> {
      const { where, params } = buildWhere(filter);
      const clauses = where ? [where.replace(/^WHERE /, '')] : [];
      const all = [...params];
      if (cursor) {
        clauses.push('(occurred_at < ? OR (occurred_at = ? AND id < ?))');
        all.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
      }
      const rows = await db.all<TransactionRow>(
        `SELECT * FROM transactions ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
         ORDER BY occurred_at DESC, id DESC LIMIT ?`,
        [...all, limit + 1],
      );
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(mapTransaction);
      const last = items[items.length - 1];
      return { items, nextCursor: hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null };
    },

    async summarize(filter: TransactionFilter = {}): Promise<FilterSummary> {
      const { where, params } = buildWhere(filter);
      const row = await db.first<{ c: number; net: number | null }>(
        `SELECT COUNT(*) AS c,
                SUM(CASE type WHEN 'income' THEN amount_paise ELSE -amount_paise END) AS net
         FROM transactions ${where}`,
        params,
      );
      return { count: row?.c ?? 0, netPaise: row?.net ?? 0 };
    },

    async count(): Promise<number> {
      const row = await db.first<{ c: number }>('SELECT COUNT(*) AS c FROM transactions');
      return row?.c ?? 0;
    },

    async removeAll(): Promise<void> {
      await db.run('DELETE FROM transactions');
      notify();
    },
  };
}

export type TransactionsRepo = ReturnType<typeof createTransactionsRepo>;
