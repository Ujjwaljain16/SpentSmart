import { Paise } from '../money';
import { TransactionType } from '../types';

/** The fields the detectors read. `Transaction` satisfies it; the app can also pass a slimmer row. */
export interface InsightTxn {
  id: string;
  type: TransactionType;
  amountPaise: Paise;
  occurredAt: number;
  payeeName: string;
  payeeVpa: string | null;
  categoryKey: string;
}

/** Why an insight exists: the rows it was built from and the rule that turned them into a claim. */
export interface Evidence {
  transactionIds: string[];
  /** Plain-language rule with the actual numbers filled in. */
  formula: string;
  period?: { start: number; end: number };
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One key per payee: the UPI ID when there is one (stable), otherwise the name with case, punctuation, digits and
 * common suffixes removed so "Netflix.com", "NETFLIX" and "netflix 1234" group together.
 */
export function payeeKey(t: Pick<InsightTxn, 'payeeName' | 'payeeVpa'>): string {
  if (t.payeeVpa) return `vpa:${t.payeeVpa.trim().toLowerCase()}`;
  const name = t.payeeName
    .toLowerCase()
    .replace(/\.(com|in|co)\b/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|llp|inc|india)\b/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return `name:${name}`;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median absolute deviation, a spread measure that a single outlier can't drag around. */
export function mad(values: readonly number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export function isSpending(t: InsightTxn): boolean {
  return t.type === 'expense';
}
