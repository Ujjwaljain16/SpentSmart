/**
 * Money is always handled as an integer number of paise (1 INR = 100 paise).
 * Floating point rupees never enter storage or arithmetic.
 */
export type Paise = number;

/** Upper bound for a single transaction: ₹1,00,00,000 (1 crore). Far below 2^53. */
export const MAX_PAISE: Paise = 1_00_00_000 * 100;

export function isValidPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_PAISE;
}

/**
 * Strictly parse a user/QR supplied rupee string into paise.
 * Accepts "1", "1.5", "1.50", "₹ 1,250.75", ".5". Rejects negatives, exponents,
 * trailing garbage, more than two decimals, zero and values above MAX_PAISE.
 */
export function parseRupees(input: string | null | undefined): Paise | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.split('.');
  if (whole.length > 10) return null;
  const paise = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  return isValidPaise(paise) ? paise : null;
}

/** Plain decimal rupee string for URIs and inputs, e.g. 125050 -> "1250.50". */
export function paiseToDecimal(paise: Paise): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(paise));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

/** Indian digit grouping (12,34,567). */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export interface FormatOptions {
  /** Prefix with ₹. Default true. */
  symbol?: boolean;
  /** Always show two decimals. Default false (hides ".00"). */
  alwaysDecimals?: boolean;
}

export function formatPaise(paise: Paise, opts: FormatOptions = {}): string {
  const { symbol = true, alwaysDecimals = false } = opts;
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const whole = String(Math.floor(abs / 100));
  const frac = abs % 100;
  let out = groupIndian(whole);
  if (frac !== 0 || alwaysDecimals) out += `.${String(frac).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${out}`;
}

/** Rounded percentage of `part` in `total` (0 when total is 0). */
export function percentOf(part: Paise, total: Paise): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
