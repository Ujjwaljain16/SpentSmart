import { parse } from 'date-fns';
import { OTHER_CATEGORY_KEY, INCOME_CATEGORY_KEY } from '../categories';
import { parseRupees } from '../money';
import { CSV_HEADER } from '../report';
import { Category, PaymentMethod } from '../types';
import { parseCsv } from './csv';

export interface RestoredRow {
  line: number;
  occurredAt: number;
  amountPaise: number;
  type: 'expense' | 'income' | 'refund';
  categoryKey: string;
  payeeName: string;
  payeeVpa: string | null;
  paymentMethod: PaymentMethod;
  note: string | null;
  upiTxnId: string | null;
}

export interface RestoreParse {
  rows: RestoredRow[];
  /** Transfer legs can't be rebuilt: the export doesn't say which accounts the money moved between. */
  skippedTransfers: number;
  skipped: { line: number; reason: string }[];
}

/** True when the file is SpentSmart's own CSV export (Settings → Export CSV). */
export function isSpentSmartExport(text: string): boolean {
  const first = parseCsv(text.split(/\r?\n/, 1)[0] ?? '')[0] ?? [];
  return first.length === CSV_HEADER.length && first.every((h, i) => h === CSV_HEADER[i]);
}

const METHODS: readonly PaymentMethod[] = ['upi', 'cash', 'bank', 'other'];

/** Undo the export's spreadsheet-formula guard (a leading apostrophe before = + - @). */
const unguard = (s: string | undefined) => (s && /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : (s ?? ''));

/**
 * Read SpentSmart's own export back in, keeping type, category (matched by name), payee, method and note, so an
 * export works as a backup. Categories that no longer exist fall back to "Other".
 */
export function parseSpentSmartExport(text: string, categories: readonly Category[]): RestoreParse {
  const table = parseCsv(text);
  const rows: RestoredRow[] = [];
  const skipped: RestoreParse['skipped'] = [];
  let skippedTransfers = 0;
  const byLabel = new Map(categories.map((c) => [c.label.toLowerCase(), c.key]));

  for (let i = 1; i < table.length; i++) {
    const r = table[i]!;
    if (r.every((f) => f === '')) continue;
    const line = i + 1;
    const [date, time, type, amount, category, payee, vpa, method, note, , upiTxnId] = r;
    if (type === 'transfer') {
      skippedTransfers++;
      continue;
    }
    if (type !== 'expense' && type !== 'income' && type !== 'refund') {
      skipped.push({ line, reason: 'unknown type' });
      continue;
    }
    const when = parse(`${date} ${time || '12:00'}`, 'yyyy-MM-dd HH:mm', new Date(2000, 0, 1));
    const paise = parseRupees(amount ?? '');
    if (Number.isNaN(when.getTime()) || paise === null) {
      skipped.push({ line, reason: Number.isNaN(when.getTime()) ? 'no readable date' : 'no amount' });
      continue;
    }
    rows.push({
      line,
      occurredAt: when.getTime(),
      amountPaise: paise,
      type,
      categoryKey: type === 'income' ? INCOME_CATEGORY_KEY : (byLabel.get((category ?? '').toLowerCase()) ?? OTHER_CATEGORY_KEY),
      payeeName: unguard(payee).trim() || (type === 'income' ? 'Income' : 'Expense'),
      payeeVpa: vpa?.trim() || null,
      paymentMethod: METHODS.includes(method as PaymentMethod) ? (method as PaymentMethod) : 'other',
      note: unguard(note).trim() || null,
      upiTxnId: upiTxnId?.trim() || null,
    });
  }
  return { rows, skippedTransfers, skipped };
}
