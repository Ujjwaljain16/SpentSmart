import { Paise } from '@/domain/money';
import { PaymentSuggestion } from '@/domain/upi/response';
import { Transaction } from '@/domain/types';
import { SqlDriver } from '../driver';
import { RepoDeps } from './deps';
import { createTransactionsRepo } from './transactions';

export type AttemptStatus = 'launched' | 'needs_review' | 'recorded' | 'discarded' | 'expired';

export interface PaymentAttempt {
  id: string;
  vpa: string;
  payeeName: string;
  amountPaise: Paise | null;
  note: string | null;
  categoryKey: string;
  appPackage: string | null;
  txnRef: string | null;
  status: AttemptStatus;
  suggestion: PaymentSuggestion | null;
  /** Raw response string returned by the UPI app, if any. */
  response: string | null;
  createdAt: number;
  launchedAt: number | null;
  returnedAt: number | null;
  snoozedUntil: number | null;
}

interface AttemptRow {
  id: string;
  vpa: string;
  payee_name: string;
  amount_paise: number | null;
  note: string | null;
  category_key: string;
  app_package: string | null;
  txn_ref: string | null;
  status: AttemptStatus;
  suggestion: PaymentSuggestion | null;
  response: string | null;
  created_at: number;
  launched_at: number | null;
  returned_at: number | null;
  snoozed_until: number | null;
}

const mapAttempt = (r: AttemptRow): PaymentAttempt => ({
  id: r.id,
  vpa: r.vpa,
  payeeName: r.payee_name,
  amountPaise: r.amount_paise,
  note: r.note,
  categoryKey: r.category_key,
  appPackage: r.app_package,
  txnRef: r.txn_ref,
  status: r.status,
  suggestion: r.suggestion,
  response: r.response,
  createdAt: r.created_at,
  launchedAt: r.launched_at,
  returnedAt: r.returned_at,
  snoozedUntil: r.snoozed_until,
});

/** Unresolved attempts older than this are expired instead of nagging forever. */
export const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
/** Resolved/expired attempts are deleted after this long. */
export const ATTEMPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_SNOOZE_MS = 60 * 60 * 1000;

export interface NewAttempt {
  vpa: string;
  payeeName: string;
  amountPaise: Paise | null;
  note: string | null;
  categoryKey: string;
  appPackage: string | null;
  txnRef: string | null;
}

export interface RecordOverrides {
  amountPaise?: Paise;
  categoryKey?: string;
  note?: string | null;
}

export function createAttemptsRepo(db: SqlDriver, deps: RepoDeps) {
  const { now, newId, notify } = deps;

  async function get(id: string): Promise<PaymentAttempt | null> {
    const row = await db.first<AttemptRow>('SELECT * FROM payment_attempts WHERE id = ?', [id]);
    return row ? mapAttempt(row) : null;
  }

  return {
    get,

    /** Persist the intent to pay *before* leaving the app, so it survives the app being killed. */
    async create(input: NewAttempt): Promise<PaymentAttempt> {
      const id = newId();
      const t = now();
      await db.run(
        `INSERT INTO payment_attempts
           (id, vpa, payee_name, amount_paise, note, category_key, app_package, txn_ref, status, created_at, launched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'launched', ?, ?)`,
        [id, input.vpa, input.payeeName, input.amountPaise, input.note, input.categoryKey, input.appPackage, input.txnRef, t, t],
      );
      notify();
      const created = await get(id);
      if (!created) throw new Error('Failed to read back payment attempt.');
      return created;
    },

    /** The user returned from the UPI app: store what it told us and ask for confirmation. */
    async markReturned(id: string, result: { suggestion: PaymentSuggestion; response: string | null }): Promise<void> {
      await db.run(
        `UPDATE payment_attempts SET status = 'needs_review', suggestion = ?, response = ?, returned_at = ?
         WHERE id = ? AND status IN ('launched', 'needs_review')`,
        [result.suggestion, result.response, now(), id],
      );
      notify();
    },

    /** Unresolved attempts that should currently be offered to the user (not snoozed, not expired). */
    async listOpen(): Promise<PaymentAttempt[]> {
      const t = now();
      const rows = await db.all<AttemptRow>(
        `SELECT * FROM payment_attempts
         WHERE status IN ('launched', 'needs_review') AND created_at > ?
           AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ORDER BY created_at DESC`,
        [t - ATTEMPT_TTL_MS, t],
      );
      return rows.map(mapAttempt);
    },

    async snooze(id: string, forMs: number = DEFAULT_SNOOZE_MS): Promise<void> {
      await db.run(
        `UPDATE payment_attempts SET snoozed_until = ? WHERE id = ? AND status IN ('launched', 'needs_review')`,
        [now() + forMs, id],
      );
      notify();
    },

    async snoozeAll(forMs: number = DEFAULT_SNOOZE_MS): Promise<void> {
      await db.run(`UPDATE payment_attempts SET snoozed_until = ? WHERE status IN ('launched', 'needs_review')`, [now() + forMs]);
      notify();
    },

    async discard(id: string): Promise<void> {
      await db.run(
        `UPDATE payment_attempts SET status = 'discarded' WHERE id = ? AND status IN ('launched', 'needs_review')`,
        [id],
      );
      notify();
    },

    /**
     * Turn an attempt into a transaction and close it, atomically. Calling it twice never creates two
     * transactions (the insert is idempotent on attempt id).
     */
    async record(id: string, overrides: RecordOverrides = {}, verifiedBy: 'upi_result' | 'user' = 'user', txn?: { id?: string; ref?: string }): Promise<Transaction | null> {
      const tx = await db.transaction(async (executor) => {
        const row = await executor.first<AttemptRow>('SELECT * FROM payment_attempts WHERE id = ?', [id]);
        if (!row) return null;
        const attempt = mapAttempt(row);
        const amount = overrides.amountPaise ?? attempt.amountPaise;
        if (amount == null) return null;

        const repo = createTransactionsRepo(executor, { ...deps, notify: () => undefined });
        const created = await repo.insert({
          amountPaise: amount,
          type: 'expense',
          categoryKey: overrides.categoryKey ?? attempt.categoryKey,
          payeeName: attempt.payeeName,
          payeeVpa: attempt.vpa,
          paymentMethod: 'upi',
          note: overrides.note !== undefined ? overrides.note : attempt.note,
          occurredAt: attempt.launchedAt ?? attempt.createdAt,
          verifiedBy,
          upiTxnId: txn?.id ?? null,
          upiTxnRef: txn?.ref ?? attempt.txnRef,
          attemptId: attempt.id,
        });
        await executor.run(`UPDATE payment_attempts SET status = 'recorded' WHERE id = ?`, [id]);
        return created;
      });
      notify();
      return tx;
    },

    /** Expire stale attempts and delete old resolved ones. Safe to call on every app start. */
    async cleanup(): Promise<void> {
      const t = now();
      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE payment_attempts SET status = 'expired' WHERE status IN ('launched', 'needs_review') AND created_at <= ?`,
          [t - ATTEMPT_TTL_MS],
        );
        await tx.run(
          `DELETE FROM payment_attempts WHERE status IN ('recorded', 'discarded', 'expired') AND created_at <= ?`,
          [t - ATTEMPT_RETENTION_MS],
        );
      });
    },
  };
}

export type AttemptsRepo = ReturnType<typeof createAttemptsRepo>;
