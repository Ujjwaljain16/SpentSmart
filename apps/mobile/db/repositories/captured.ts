import { CaptureDirection } from '@spentsmart/finance/capture/payment-text';
import { Paise } from '@spentsmart/finance/money';
import { SqlDriver } from '../driver';
import { RepoDeps } from './deps';

export type CapturedStatus = 'new' | 'added' | 'ignored';

export interface CapturedPayment {
  id: string;
  source: 'notification' | 'proxy';
  app: string | null;
  direction: CaptureDirection;
  amountPaise: Paise;
  payeeName: string | null;
  payeeVpa: string | null;
  reference: string | null;
  via: 'upi' | 'card' | 'atm' | null;
  occurredAt: number;
  status: CapturedStatus;
  transactionId: string | null;
  createdAt: number;
}

export type NewCaptured = Omit<CapturedPayment, 'id' | 'status' | 'transactionId' | 'createdAt'>;

/** One payment usually arrives twice (the UPI app's notification and the bank's SMS) within a few minutes. */
export const SAME_PAYMENT_WINDOW_MS = 10 * 60 * 1000;
/** Handled captures are kept this long so a late duplicate is still recognised, then deleted. */
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

interface Row {
  id: string;
  source: CapturedPayment['source'];
  app: string | null;
  direction: CaptureDirection;
  amount_paise: number;
  payee_name: string | null;
  payee_vpa: string | null;
  reference: string | null;
  via: CapturedPayment['via'];
  occurred_at: number;
  status: CapturedStatus;
  transaction_id: string | null;
  created_at: number;
}

const map = (r: Row): CapturedPayment => ({
  id: r.id,
  source: r.source,
  app: r.app,
  direction: r.direction,
  amountPaise: r.amount_paise,
  payeeName: r.payee_name,
  payeeVpa: r.payee_vpa,
  reference: r.reference,
  via: r.via,
  occurredAt: r.occurred_at,
  status: r.status,
  transactionId: r.transaction_id,
  createdAt: r.created_at,
});

export function createCapturedRepo(db: SqlDriver, deps: RepoDeps) {
  const { now, newId, notify } = deps;

  return {
    /**
     * Store a captured payment unless it's one we already have: the same reference, or the same amount and
     * direction within a few minutes (missing details are filled in from the newcomer), or a transaction that is
     * already in the books (paid through SpentSmart, or added by hand).
     */
    async add(input: NewCaptured): Promise<'added' | 'duplicate' | 'already_recorded'> {
      const twin = await db.first<Row>(
        `SELECT * FROM captured_payments
         WHERE (reference IS NOT NULL AND reference = ?)
            OR (direction = ? AND amount_paise = ? AND ABS(occurred_at - ?) <= ?)
         ORDER BY occurred_at DESC LIMIT 1`,
        [input.reference, input.direction, input.amountPaise, input.occurredAt, SAME_PAYMENT_WINDOW_MS],
      );
      if (twin) {
        await db.run(
          `UPDATE captured_payments SET payee_name = COALESCE(payee_name, ?), payee_vpa = COALESCE(payee_vpa, ?),
             reference = COALESCE(reference, ?), via = COALESCE(via, ?) WHERE id = ?`,
          [input.payeeName, input.payeeVpa, input.reference, input.via, twin.id],
        );
        notify();
        return 'duplicate';
      }

      const type = input.direction === 'debit' ? 'expense' : 'income';
      const recorded = await db.first<{ id: string }>(
        `SELECT id FROM transactions WHERE deleted_at IS NULL AND type = ? AND amount_paise = ? AND ABS(occurred_at - ?) <= ? LIMIT 1`,
        [type, input.amountPaise, input.occurredAt, SAME_PAYMENT_WINDOW_MS],
      );
      if (recorded) return 'already_recorded';

      await db.run(
        `INSERT INTO captured_payments (id, source, app, direction, amount_paise, payee_name, payee_vpa, reference, via,
           occurred_at, status, transaction_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?)`,
        [newId(), input.source, input.app, input.direction, input.amountPaise, input.payeeName, input.payeeVpa, input.reference, input.via, input.occurredAt, now()],
      );
      notify();
      return 'added';
    },

    async listNew(): Promise<CapturedPayment[]> {
      const rows = await db.all<Row>(`SELECT * FROM captured_payments WHERE status = 'new' ORDER BY occurred_at DESC`);
      return rows.map(map);
    },

    async countNew(): Promise<number> {
      return (await db.first<{ c: number }>(`SELECT COUNT(*) AS c FROM captured_payments WHERE status = 'new'`))?.c ?? 0;
    },

    async get(id: string): Promise<CapturedPayment | null> {
      const row = await db.first<Row>('SELECT * FROM captured_payments WHERE id = ?', [id]);
      return row ? map(row) : null;
    },

    async markAdded(id: string, transactionId: string | null): Promise<void> {
      await db.run(`UPDATE captured_payments SET status = 'added', transaction_id = ? WHERE id = ?`, [transactionId, id]);
      notify();
    },

    /** A payment just recorded another way settles any waiting capture of the same payment. */
    async settleTwins(direction: CaptureDirection, amountPaise: Paise, occurredAt: number, transactionId: string): Promise<void> {
      await db.run(
        `UPDATE captured_payments SET status = 'added', transaction_id = ?
         WHERE status = 'new' AND direction = ? AND amount_paise = ? AND ABS(occurred_at - ?) <= ?`,
        [transactionId, direction, amountPaise, occurredAt, SAME_PAYMENT_WINDOW_MS],
      );
      notify();
    },

    async ignore(id: string): Promise<void> {
      await db.run(`UPDATE captured_payments SET status = 'ignored' WHERE id = ?`, [id]);
      notify();
    },

    /** Forget every captured payment, handled or not. Transactions already made from them stay. */
    async clear(): Promise<void> {
      await db.run('DELETE FROM captured_payments');
      notify();
    },

    async cleanup(): Promise<void> {
      await db.run(`DELETE FROM captured_payments WHERE status != 'new' AND created_at < ?`, [now() - RETENTION_MS]);
    },
  };
}
