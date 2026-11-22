import { LedgerType, TransferRole } from './ledger';
import { Paise } from './money';

export type TransactionType = LedgerType;
export type { TransferRole };
export type AccountType = 'cash' | 'bank' | 'wallet' | 'credit';
export const ACCOUNT_TYPES: readonly AccountType[] = ['cash', 'bank', 'wallet', 'credit'];
/** Where a record came from, so imported or AI-suggested entries can be told apart from typed ones. */
export type TransactionSource = 'manual' | 'scan' | 'quick_add' | 'voice' | 'ocr' | 'import' | 'ai';
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
  accountId: string;
  source: TransactionSource;
  /** Incremented on every edit; used by sync to detect conflicting changes. */
  version: number;
  /** Both legs of a transfer share this id. */
  transferId: string | null;
  transferRole: TransferRole | null;
  tags: string[];
}

export interface NewTransaction {
  amountPaise: Paise;
  /** Transfers are created with `createTransfer`, never directly. */
  type: Exclude<TransactionType, 'transfer'>;
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
  /** Defaults to the Cash account for cash payments and the main account otherwise. */
  accountId?: string;
  source?: TransactionSource;
  tags?: readonly string[];
}

export type TransactionPatch = Partial<
  Pick<Transaction, 'amountPaise' | 'categoryKey' | 'payeeName' | 'paymentMethod' | 'note' | 'occurredAt' | 'accountId'>
> & {
  type?: Exclude<TransactionType, 'transfer'>;
  tags?: readonly string[];
};

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalancePaise: number;
  sortOrder: number;
  archived: boolean;
}

export interface Budget {
  id: string;
  /** `null` = overall monthly budget across all spending. */
  categoryKey: string | null;
  limitPaise: Paise;
  rollover: boolean;
}

export interface Goal {
  id: string;
  name: string;
  targetPaise: Paise;
  savedPaise: number;
  /** epoch ms, or null for no deadline */
  deadline: number | null;
  archived: boolean;
}

export interface Category {
  key: string;
  label: string;
  icon: string;
  color: string;
  sortOrder: number;
  /** System categories ("other", "income") cannot be deleted. */
  isSystem: boolean;
}
