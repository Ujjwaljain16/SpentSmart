import { isValid, parse } from 'date-fns';
import { MAX_PAISE, Paise } from '../money';
import { parseCsv } from './csv';

export interface StatementRow {
  /** 1-based line in the file, for "line 14 couldn't be read" messages. */
  line: number;
  occurredAt: number;
  amountPaise: Paise;
  type: 'expense' | 'income';
  payeeName: string;
  payeeVpa: string | null;
  /** UPI reference / UTR when the narration has one; the strongest key for spotting duplicates. */
  reference: string | null;
  description: string;
}

export interface StatementParse {
  rows: StatementRow[];
  skipped: { line: number; reason: string }[];
  /** Which columns were used, so the app can show "Date · Narration · Withdrawal · Deposit". */
  columns: { date: string; description: string; amount: string };
}

export class UnreadableStatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableStatementError';
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z/]+/g, ' ').trim();
const HEADERS = {
  date: ['date', 'txn date', 'transaction date', 'tran date', 'value date', 'value dt', 'posting date'],
  description: ['narration', 'description', 'particulars', 'remarks', 'details', 'transaction details', 'transaction remarks'],
  debit: ['debit', 'withdrawal', 'withdrawal amt', 'withdrawal amount', 'debit amount', 'dr', 'withdrawals', 'debit amt'],
  credit: ['credit', 'deposit', 'deposit amt', 'deposit amount', 'credit amount', 'cr', 'deposits', 'credit amt'],
  amount: ['amount', 'transaction amount', 'txn amount', 'amount inr', 'amount rs'],
  drcr: ['dr/cr', 'cr/dr', 'type', 'debit/credit', 'txn type', 'transaction type'],
  reference: ['ref no', 'chq/ref no', 'chq ref no', 'reference', 'reference no', 'utr', 'ref no cheque no', 'cheque no', 'transaction id', 'upi ref no'],
} as const;

function findColumn(header: string[], names: readonly string[], taken: Set<number>): number {
  // Exact names first ("date" before "value date"), then prefix matches like "Withdrawal Amt.(INR)".
  for (const pass of [0, 1]) {
    for (const name of names) {
      const i = header.findIndex((h, idx) => !taken.has(idx) && (pass === 0 ? norm(h) === name : norm(h).startsWith(name)));
      if (i !== -1) return i;
    }
  }
  return -1;
}

const DATE_FORMATS = ['dd/MM/yyyy', 'dd-MM-yyyy', 'dd/MM/yy', 'dd-MM-yy', 'yyyy-MM-dd', 'dd-MMM-yyyy', 'dd MMM yyyy', 'dd-MMM-yy', 'dd MMM yy', 'd/M/yyyy', 'dd.MM.yyyy', 'MMM d, yyyy'];

/** Indian statements are day-first; ambiguous dates are read that way. */
export function parseStatementDate(value: string): number | null {
  const v = value.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i, '');
  for (const f of DATE_FORMATS) {
    const d = parse(v, f, new Date(2000, 0, 1, 12));
    if (isValid(d) && d.getFullYear() > 1990 && d.getFullYear() < 2100) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  }
  return null;
}

/** "1,23,456.70", "₹ 250", "(500.00)", "250.00 Dr" → signed paise; blank or "-" → null. */
export function parseStatementAmount(value: string): number | null {
  let v = value.trim();
  if (v === '' || v === '-' || v === '--') return null;
  let sign = 1;
  if (/^\(.*\)$/.test(v)) {
    sign = -1;
    v = v.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(v)) {
    sign = -1;
    v = v.replace(/\bdr\.?$/i, '');
  }
  v = v.replace(/\bcr\.?$/i, '').replace(/₹|inr|rs\.?/gi, '').replace(/,/g, '').trim();
  if (v.startsWith('-')) {
    sign *= -1;
    v = v.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return sign * Math.round(Number(v) * 100);
}

/**
 * Pull the counterparty out of a bank narration. Handles the common UPI shapes:
 *   UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl/Payment
 *   UPI-SWIGGY-SWIGGY@YBL-YESB0000001-412345678901-UPI
 *   UPI/412345678901/Rahul Kumar/rahul@okaxis/
 */
export function readNarration(description: string): { payeeName: string; payeeVpa: string | null; reference: string | null } {
  const d = description.replace(/\s+/g, ' ').trim();
  // No hyphens in the local part: several banks use '-' as the narration separator right before the UPI ID.
  const vpa = d.match(/[a-z0-9._]{2,}@[a-z]{2,}/i)?.[0]?.toLowerCase() ?? null;
  const reference = d.match(/(?<!\d)\d{12}(?!\d)/)?.[0] ?? null;
  if (/^upi\b/i.test(d)) {
    const parts = d.split(/[/-]/).map((p) => p.trim()).filter(Boolean);
    const name = parts.find((p) => !/^(upi|dr|cr|p2a|p2m|payment|pay|collect|na)$/i.test(p) && !/^\d+$/.test(p) && !p.includes('@') && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p) && !/^[A-Z]{4}$/.test(p));
    return { payeeName: tidy(name ?? vpa ?? 'UPI payment'), payeeVpa: vpa, reference };
  }
  // NEFT/IMPS/ATM and plain merchant text: drop the channel and reference noise, keep the words.
  const cleaned = d
    .replace(/^(neft|imps|rtgs|ach|nach|pos|atm|ecom|ib|mb)\b[\s/:-]*(dr|cr)?[\s/:-]*/i, '')
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, '')
    .replace(/\b\d{4,6}[X*]{4,}\d{3,4}\b/gi, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/[/*_:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { payeeName: tidy(cleaned || d), payeeVpa: vpa, reference };
}

function tidy(name: string): string {
  const t = name.replace(/\s+/g, ' ').trim().slice(0, 60);
  // ALL-CAPS bank text reads better in title case; leave mixed case as the bank wrote it.
  return t === t.toUpperCase() ? t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : t;
}

/** Read a bank or UPI-app CSV export. Header rows above the table (account details etc.) are skipped. */
export function parseStatement(text: string): StatementParse {
  const table = parseCsv(text);
  let headerIndex = -1;
  let cols = { date: -1, description: -1, debit: -1, credit: -1, amount: -1, drcr: -1, reference: -1 };
  for (let i = 0; i < Math.min(table.length, 30); i++) {
    const h = table[i]!;
    const taken = new Set<number>();
    const pick = (names: readonly string[]) => {
      const idx = findColumn(h, names, taken);
      if (idx !== -1) taken.add(idx);
      return idx;
    };
    // "Dr/Cr" first: otherwise the prefix match would take it as the debit column.
    const drcr = pick(HEADERS.drcr);
    const c = { date: pick(HEADERS.date), description: pick(HEADERS.description), debit: pick(HEADERS.debit), credit: pick(HEADERS.credit), amount: -1, drcr, reference: pick(HEADERS.reference) };
    c.amount = pick(HEADERS.amount);
    if (c.date !== -1 && c.description !== -1 && ((c.debit !== -1 && c.credit !== -1) || c.amount !== -1)) {
      headerIndex = i;
      cols = c;
      break;
    }
  }
  if (headerIndex === -1) throw new UnreadableStatementError('Couldn’t find the date, description and amount columns. Export the statement as CSV and try again.');

  const header = table[headerIndex]!;
  const rows: StatementRow[] = [];
  const skipped: StatementParse['skipped'] = [];
  for (let i = headerIndex + 1; i < table.length; i++) {
    const r = table[i]!;
    const line = i + 1;
    if (r.every((f) => f === '')) continue;
    const date = parseStatementDate(r[cols.date] ?? '');
    if (date === null) {
      // Footers ("Opening balance", totals, page breaks) have no date; only complain about rows that look like data.
      if (r.filter(Boolean).length >= 3) skipped.push({ line, reason: 'no readable date' });
      continue;
    }
    let signed: number | null;
    if (cols.debit !== -1 && cols.credit !== -1) {
      const dr = parseStatementAmount(r[cols.debit] ?? '');
      const cr = parseStatementAmount(r[cols.credit] ?? '');
      signed = dr ? -Math.abs(dr) : cr ? Math.abs(cr) : null;
    } else {
      signed = parseStatementAmount(r[cols.amount] ?? '');
      const flag = cols.drcr !== -1 ? norm(r[cols.drcr] ?? '') : '';
      if (signed !== null && flag) signed = /^(dr|debit|d|withdrawal)/.test(flag) ? -Math.abs(signed) : /^(cr|credit|c|deposit)/.test(flag) ? Math.abs(signed) : signed;
    }
    if (signed === null || signed === 0) {
      skipped.push({ line, reason: 'no amount' });
      continue;
    }
    if (Math.abs(signed) > MAX_PAISE) {
      skipped.push({ line, reason: 'amount too large' });
      continue;
    }
    const description = r[cols.description] ?? '';
    const n = readNarration(description);
    const refColumn = cols.reference !== -1 ? (r[cols.reference] ?? '').replace(/^0+$/, '').trim() : '';
    rows.push({
      line,
      occurredAt: date,
      amountPaise: Math.abs(signed),
      type: signed < 0 ? 'expense' : 'income',
      payeeName: n.payeeName,
      payeeVpa: n.payeeVpa,
      reference: n.reference ?? (refColumn || null),
      description,
    });
  }
  return {
    rows,
    skipped,
    columns: {
      date: header[cols.date]!,
      description: header[cols.description]!,
      amount: cols.debit !== -1 && cols.credit !== -1 ? `${header[cols.debit]} / ${header[cols.credit]}` : header[cols.amount]!,
    },
  };
}

export interface ExistingTxn {
  id: string;
  occurredAt: number;
  amountPaise: number;
  type: string;
  payeeName: string;
  payeeVpa: string | null;
  upiTxnRef: string | null;
  upiTxnId: string | null;
}

const DAY = 86_400_000;
const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Split imported rows into new ones and ones already in the app. A matching UPI reference is certain; otherwise the
 * same amount and direction within a day either side, with the same UPI ID or a payee name that overlaps. Each
 * existing transaction can only absorb one imported row, so two identical ₹20 chais on the same day both survive
 * when only one was recorded.
 */
export function findDuplicates(rows: readonly StatementRow[], existing: readonly ExistingTxn[]): { fresh: StatementRow[]; duplicates: { row: StatementRow; matchId: string }[] } {
  const used = new Set<string>();
  const fresh: StatementRow[] = [];
  const duplicates: { row: StatementRow; matchId: string }[] = [];
  for (const row of rows) {
    const byRef = row.reference ? existing.find((e) => !used.has(e.id) && (e.upiTxnRef === row.reference || e.upiTxnId === row.reference)) : undefined;
    const match =
      byRef ??
      existing.find((e) => {
        if (used.has(e.id) || e.amountPaise !== row.amountPaise || Math.abs(e.occurredAt - row.occurredAt) > 1.5 * DAY) return false;
        const sameDirection = row.type === 'expense' ? e.type === 'expense' || e.type === 'transfer' : e.type === 'income' || e.type === 'refund' || e.type === 'transfer';
        if (!sameDirection) return false;
        // A transfer recorded in the app (say, bank to cash) shows up in the bank as a withdrawal with any name.
        if (e.type === 'transfer') return true;
        if (row.payeeVpa && e.payeeVpa) return row.payeeVpa === e.payeeVpa.toLowerCase();
        const a = simplify(row.payeeName);
        const b = simplify(e.payeeName);
        return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a));
      });
    if (match) {
      used.add(match.id);
      duplicates.push({ row, matchId: match.id });
    } else fresh.push(row);
  }
  return { fresh, duplicates };
}
