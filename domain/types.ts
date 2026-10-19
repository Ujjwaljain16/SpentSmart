import { Paise } from './money';

export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'upi' | 'cash' | 'bank' | 'other';
/** How the record was confirmed: by the UPI app's result, by the user, or typed in manually. */
export type VerifiedBy = 'upi_result' | 'user' | 'manual';

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['upi', 'cash', 'bank', 'other'];

export interface Transaction {
  id: string;
  amountPaise: Paise;
  type: TransactionType;
  categoryKey: string;
  payeeName: string;
  payeeVpa: string | null;
  paymentMethod: PaymentMethod;
  note: string | null;
  /** When the payment happened (user-editable). */
  occurredAt: number;
  /** When the row was created. */
  createdAt: number;
  verifiedBy: VerifiedBy;
  upiTxnId: string | null;
  upiTxnRef: string | null;
  attemptId: string | null;
}

export interface NewTransaction {
  amountPaise: Paise;
  type: TransactionType;
  categoryKey: string;
  payeeName: string;
  payeeVpa?: string | null;
  paymentMethod: PaymentMethod;
  note?: string | null;
  occurredAt?: number;
  verifiedBy: VerifiedBy;
  upiTxnId?: string | null;
  upiTxnRef?: string | null;
  attemptId?: string | null;
}

export type TransactionPatch = Partial<
  Pick<Transaction, 'amountPaise' | 'type' | 'categoryKey' | 'payeeName' | 'paymentMethod' | 'note' | 'occurredAt'>
>;

export interface Category {
  key: string;
  label: string;
  icon: string;
  color: string;
  sortOrder: number;
  /** System categories ("other", "income") cannot be deleted. */
  isSystem: boolean;
}
