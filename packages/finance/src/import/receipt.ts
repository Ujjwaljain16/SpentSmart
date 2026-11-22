import { MAX_PAISE, Paise } from '../money';
import { parseStatementDate } from './statement';

export interface ReceiptReading {
  amountPaise: Paise | null;
  merchant: string | null;
  occurredAt: number | null;
  /** "high" when the amount sat on a total line; "low" when it was the largest amount found. */
  confidence: 'high' | 'low';
  /** The line the amount came from, so the app can show what it read. */
  amountLine: string | null;
}

const AMOUNT = /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?/gi;
// Ranked: the first kind that appears wins over later kinds.
const TOTAL_LABELS: readonly RegExp[] = [
  /\bgrand\s*total\b/i,
  /\b(net\s*(amount|amt|total|payable)|amount\s*payable|total\s*payable|to\s*pay|bill\s*amount|amount\s*due|total\s*due)\b/i,
  /\btotal\b/i,
];
const NOT_TOTAL = /\b(sub\s*-?\s*total|total\s*(qty|items?|quantity|savings?|discount|tax|gst)|savings|discount|you\s*saved|cgst|sgst|igst|gst|vat|round\s*off|change|cash\s*tendered|tendered)\b/i;
const NOT_MERCHANT = /(tax\s*invoice|invoice|receipt|cash\s*memo|bill\s*(no|of)|gstin|fssai|welcome|thank|phone|ph\s*[:.]|tel|mob|email|www\.|address|date|time|table|order|kot|cashier|^[\d\W]+$)/i;
const DATE = /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[ -](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ ,-]*\d{2,4})\b/i;

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const whole = m[1]!.replace(/,/g, '');
    // Bare integers without a currency sign or paise are usually quantities, codes or phone fragments.
    if (!m[2] && !/₹|rs|inr/i.test(m[0])) continue;
    const paise = Number(whole) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
    if (paise > 0 && paise <= MAX_PAISE) out.push(paise);
  }
  return out;
}

function tidy(name: string): string {
  const t = name.replace(/[^A-Za-z0-9&'. -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : t;
}

/**
 * Read the useful parts of a shop bill from OCR lines (top to bottom). Conservative: a wrong total is worse than
 * none, because the user confirms the result before it's saved and can type the amount themselves.
 */
export function readReceipt(lines: readonly string[]): ReceiptReading {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  let amountPaise: number | null = null;
  let amountLine: string | null = null;
  let confidence: ReceiptReading['confidence'] = 'low';
  search: for (const label of TOTAL_LABELS) {
    // Totals sit at the bottom; read upwards so a "Total" in an item name near the top loses.
    for (let i = clean.length - 1; i >= 0; i--) {
      const line = clean[i]!;
      if (!label.test(line) || NOT_TOTAL.test(line)) continue;
      // OCR often splits "TOTAL" and "450.00" into neighbouring lines.
      const candidates = [line, clean[i + 1] ?? ''];
      for (const c of candidates) {
        const found = amountsIn(c);
        if (found.length > 0) {
          amountPaise = found[found.length - 1]!;
          amountLine = c === line ? line : `${line} ${c}`;
          confidence = 'high';
          break search;
        }
      }
    }
  }
  if (amountPaise === null) {
    const all = clean.flatMap((l) => amountsIn(l).map((a) => ({ a, l })));
    const biggest = all.sort((x, y) => y.a - x.a)[0];
    if (biggest) {
      amountPaise = biggest.a;
      amountLine = biggest.l;
    }
  }

  const merchantLine = clean.slice(0, 6).find((l) => /[A-Za-z]{3,}/.test(l) && !NOT_MERCHANT.test(l));
  const dateMatch = clean.map((l) => l.match(DATE)?.[1]).find(Boolean);

  return {
    amountPaise,
    merchant: merchantLine ? tidy(merchantLine) : null,
    occurredAt: dateMatch ? parseStatementDate(dateMatch.replace(/[ ,]+/g, ' ').replace(/(\d)\.(\d)/g, '$1/$2')) : null,
    confidence,
    amountLine,
  };
}
