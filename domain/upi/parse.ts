import { Paise, parseRupees } from '@/domain/money';
import { isValidVpa, normalizeVpa, resolvePayeeName, sanitizeText } from './vpa';

export const MAX_URI_LENGTH = 2048;
const MAX_PARAM_VALUE_LENGTH = 512;

/** Params whose presence means the QR belongs to a registered merchant and must be replayed untouched. */
const STRONG_MERCHANT_KEYS = ['mid', 'tid', 'tr', 'orgid', 'sign'] as const;

export interface ParsedUpi {
  vpa: string;
  payeeName: string;
  /** Present only when the QR carries a valid fixed amount. */
  amountPaise?: Paise;
  note?: string;
  /** Exact query string as scanned (still percent-encoded). Needed to replay signed QRs byte for byte. */
  rawQuery: string;
  /** Decoded parameters, lower-cased keys. */
  params: Record<string, string>;
  /** True when the QR carries merchant-identifying parameters (mid/tid/tr/orgid/sign). */
  isMerchant: boolean;
  /** True when the QR is cryptographically signed; it must never be modified. */
  isSigned: boolean;
  /** The amount may be changed by the payer: no fixed amount, or a minimum-amount (`mam`) param. */
  amountEditable: boolean;
}

export type ParseFailure =
  | 'empty'
  | 'not_upi'
  | 'too_long'
  | 'missing_payee'
  | 'invalid_payee'
  | 'invalid_amount'
  | 'unsupported_currency';

export type ParseResult = { ok: true; data: ParsedUpi } | { ok: false; reason: ParseFailure };

export const PARSE_FAILURE_MESSAGES: Record<ParseFailure, string> = {
  empty: 'The QR code is empty.',
  not_upi: 'This QR code is not a UPI payment code.',
  too_long: 'This QR code is unusually large and was rejected for safety.',
  missing_payee: 'This QR code has no payee UPI ID.',
  invalid_payee: 'The payee UPI ID in this QR code is not valid.',
  invalid_amount: 'The amount in this QR code is not valid.',
  unsupported_currency: 'Only INR payments are supported.',
};

function safeDecode(value: string): string {
  const spaced = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/** Split a query on the first "=" of each pair so values containing "=" (e.g. base64 signatures) survive. */
export function splitQuery(query: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const part of query.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? '' : part.slice(eq + 1);
    if (key) pairs.push([key, value]);
  }
  return pairs;
}

export function extractUpiQuery(data: string): string | null {
  const trimmed = data.trim();
  const match = /^upi:(?:\/\/)?pay\?/i.exec(trimmed);
  if (!match) return null;
  const query = trimmed.slice(match[0].length);
  const hash = query.indexOf('#');
  return hash === -1 ? query : query.slice(0, hash);
}

export function parseUpiUri(data: string | null | undefined): ParseResult {
  if (!data || !data.trim()) return { ok: false, reason: 'empty' };
  if (data.length > MAX_URI_LENGTH) return { ok: false, reason: 'too_long' };

  const rawQuery = extractUpiQuery(data);
  if (rawQuery === null) return { ok: false, reason: 'not_upi' };

  const params: Record<string, string> = {};
  for (const [key, rawValue] of splitQuery(rawQuery)) {
    const lower = key.toLowerCase();
    if (lower in params) continue; // first occurrence wins; duplicates are suspicious
    const value = safeDecode(rawValue);
    if (value.length > MAX_PARAM_VALUE_LENGTH) return { ok: false, reason: 'too_long' };
    params[lower] = value;
  }

  const pa = params.pa?.trim();
  if (!pa) return { ok: false, reason: 'missing_payee' };
  if (!isValidVpa(pa)) return { ok: false, reason: 'invalid_payee' };

  if (params.cu && params.cu.trim().toUpperCase() !== 'INR') {
    return { ok: false, reason: 'unsupported_currency' };
  }

  let amountPaise: Paise | undefined;
  if (params.am !== undefined && params.am.trim() !== '') {
    const parsed = parseRupees(params.am);
    if (parsed === null) return { ok: false, reason: 'invalid_amount' };
    amountPaise = parsed;
  }

  const vpa = normalizeVpa(pa);
  const note = params.tn ? sanitizeText(params.tn, 80) || undefined : undefined;
  const isSigned = Boolean(params.sign);
  const isMerchant = STRONG_MERCHANT_KEYS.some((k) => Boolean(params[k]));

  return {
    ok: true,
    data: {
      vpa,
      payeeName: resolvePayeeName(params.pn, vpa),
      amountPaise,
      note,
      rawQuery,
      params,
      isMerchant,
      isSigned,
      amountEditable: params.mam !== undefined || amountPaise === undefined,
    },
  };
}
