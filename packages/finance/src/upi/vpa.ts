/** UPI virtual payment address: <handle>@<psp>, e.g. "name.surname-1@okhdfcbank". */
const VPA_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.]{2,64}$/;

export function isValidVpa(value: unknown): value is string {
  return typeof value === 'string' && VPA_PATTERN.test(value.trim());
}

export function normalizeVpa(value: string): string {
  return value.trim().toLowerCase();
}

const GENERIC_NAME =
  /^(merchant|google merchant|phonepe merchant|paytm merchant|bharatpe merchant|upi merchant|unknown)$/i;

/** Strip control/bidi characters and collapse whitespace so names are safe to display and store. */
export function sanitizeText(value: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F‎‏‪-‮⁦-⁩]/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Derive a readable payee name from a VPA handle when the QR name is missing/generic. */
export function deriveNameFromVpa(vpa: string): string | null {
  const handle = vpa.split('@')[0] ?? '';
  const derived = handle
    .replace(/[._-]/g, ' ')
    .replace(/[0-9]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (derived.length <= 2) return null;
  return derived.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolvePayeeName(rawName: string | undefined, vpa: string): string {
  let name = sanitizeText(rawName ?? '', 60);
  if (!name || GENERIC_NAME.test(name) || name.includes('@')) {
    name = deriveNameFromVpa(vpa) ?? (name && !name.includes('@') ? name : 'Unknown payee');
  }
  return name || 'Unknown payee';
}
