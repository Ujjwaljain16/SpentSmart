import { DEFAULT_EXPENSE_CATEGORY_KEY } from './categories';
import { Paise, parseRupees } from './money';
import { ParsedUpi } from './upi/parse';
import { isValidVpa, normalizeVpa, sanitizeText } from './upi/vpa';

/** Everything the payment screen needs, already validated. */
export interface PaymentDraft {
  vpa: string;
  payeeName: string;
  amountPaise?: Paise;
  note?: string;
  categoryKey: string;
  /** The scanned QR, if any. Needed to replay signed merchant QRs unchanged. */
  source?: ParsedUpi;
  /** False when the QR fixes the amount (the payer cannot change it). */
  amountEditable: boolean;
}

export function draftFromParsed(parsed: ParsedUpi, categoryKey: string = DEFAULT_EXPENSE_CATEGORY_KEY): PaymentDraft {
  return {
    vpa: parsed.vpa,
    payeeName: parsed.payeeName,
    amountPaise: parsed.amountPaise,
    note: parsed.note,
    categoryKey,
    source: parsed,
    amountEditable: parsed.amountEditable,
  };
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Build a draft from route params (manual entry, deep links). Route params are untrusted input: anything that
 * does not validate yields `null` and the screen refuses to proceed.
 */
export function draftFromParams(params: Params): PaymentDraft | null {
  const vpa = first(params.upiId)?.trim();
  if (!vpa || !isValidVpa(vpa)) return null;

  const rawAmount = first(params.amount)?.trim();
  let amountPaise: Paise | undefined;
  if (rawAmount) {
    const parsed = parseRupees(rawAmount);
    if (parsed === null) return null;
    amountPaise = parsed;
  }

  const normalized = normalizeVpa(vpa);
  const payeeName = sanitizeText(first(params.payeeName) ?? '', 60) || normalized;
  const note = sanitizeText(first(params.transactionNote) ?? '', 80) || undefined;
  const category = first(params.initialCategory)?.trim();

  return {
    vpa: normalized,
    payeeName,
    amountPaise,
    note,
    categoryKey: category && /^[a-z0-9-]{1,40}$/.test(category) ? category : DEFAULT_EXPENSE_CATEGORY_KEY,
    amountEditable: true,
  };
}
