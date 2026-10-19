import { format } from 'date-fns';
import { formatPaise, paiseToDecimal } from './money';
import { Category, Transaction } from './types';
import { resolveCategory } from './categories';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Colours go into inline styles, so only accept a strict hex format. */
export function safeColor(color: string, fallback = '#6B7280'): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

/**
 * Quote a CSV field (RFC 4180) and neutralise spreadsheet formula injection: a cell starting with
 * = + - @ or a control character is prefixed with an apostrophe so Excel/Sheets treat it as text.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADER = ['Date', 'Time', 'Type', 'Amount (INR)', 'Category', 'Payee', 'UPI ID', 'Method', 'Note', 'Verified by', 'UPI txn id'];

export function csvRow(t: Transaction, categories: readonly Category[]): string {
  const d = new Date(t.occurredAt);
  return [
    format(d, 'yyyy-MM-dd'),
    format(d, 'HH:mm'),
    t.type,
    paiseToDecimal(t.amountPaise),
    resolveCategory(categories, t.categoryKey).label,
    t.payeeName,
    t.payeeVpa,
    t.paymentMethod,
    t.note,
    t.verifiedBy,
    t.upiTxnId,
  ]
    .map((cell) => csvCell(cell))
    .join(',');
}

export function buildCsv(rows: readonly Transaction[], categories: readonly Category[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const t of rows) lines.push(csvRow(t, categories));
  return `${lines.join('\r\n')}\r\n`;
}

export interface ReportInput {
  title: string;
  generatedAt: Date;
  rows: readonly Transaction[];
  categories: readonly Category[];
  /** Set when more transactions matched than are printed. */
  truncatedFrom?: number;
}

interface Totals {
  income: number;
  expense: number;
  byCategory: Map<string, number>;
}

function totalsOf(rows: readonly Transaction[]): Totals {
  const byCategory = new Map<string, number>();
  let income = 0;
  let expense = 0;
  for (const t of rows) {
    if (t.type === 'income') income += t.amountPaise;
    else {
      expense += t.amountPaise;
      byCategory.set(t.categoryKey, (byCategory.get(t.categoryKey) ?? 0) + t.amountPaise);
    }
  }
  return { income, expense, byCategory };
}

/** Self-contained HTML for expo-print. Every dynamic value is escaped; no scripts, no remote resources. */
export function buildReportHtml(input: ReportInput): string {
  const { rows, categories } = input;
  const totals = totalsOf(rows);

  const categoryRows = [...totals.byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, amount]) => {
      const c = resolveCategory(categories, key);
      const pct = totals.expense > 0 ? ((amount / totals.expense) * 100).toFixed(1) : '0.0';
      return `<tr><td><span class="badge" style="color:${safeColor(c.color)}">${escapeHtml(c.label)}</span></td>` +
        `<td class="amt">${escapeHtml(formatPaise(amount, { alwaysDecimals: true }))}</td><td>${pct}%</td></tr>`;
    })
    .join('');

  const txRows = rows
    .map((t) => {
      const c = resolveCategory(categories, t.categoryKey);
      const sign = t.type === 'income' ? '+' : '−';
      return `<tr><td>${escapeHtml(format(new Date(t.occurredAt), 'dd MMM yyyy'))}</td>` +
        `<td><span class="badge" style="color:${safeColor(c.color)}">${escapeHtml(c.label)}</span></td>` +
        `<td>${escapeHtml(t.note ?? '—')}</td><td>${escapeHtml(t.payeeName)}</td>` +
        `<td class="amt">${sign}${escapeHtml(formatPaise(t.amountPaise, { alwaysDecimals: true }))}</td></tr>`;
    })
    .join('');

  const truncated =
    input.truncatedFrom && input.truncatedFrom > rows.length
      ? `<p class="note">Showing the latest ${rows.length} of ${input.truncatedFrom} transactions. Use CSV export for the full list.</p>`
      : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(input.title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,Roboto,sans-serif;font-size:12px;color:#333;line-height:1.5;padding:32px}
h1{font-size:22px;color:#0f766e}.sub{color:#666;margin:4px 0 20px}
.cards{display:flex;gap:12px;margin-bottom:20px}.card{flex:1;background:#f6f7f7;border-radius:8px;padding:14px;text-align:center}
.card h3{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}.card .v{font-size:20px;font-weight:700}
h2{font-size:14px;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid #eee}
table{width:100%;border-collapse:collapse}th{background:#f6f7f7;text-align:left;font-size:10px;text-transform:uppercase;color:#666;padding:8px}
td{padding:8px;border-bottom:1px solid #eee}.amt{text-align:right;font-weight:600;white-space:nowrap}.badge{font-weight:600}
.note{color:#888;margin-top:8px}.foot{margin-top:28px;text-align:center;color:#999;font-size:10px}
</style></head><body>
<h1>SpentSmart</h1>
<p class="sub">${escapeHtml(input.title)} • Generated ${escapeHtml(format(input.generatedAt, 'dd MMM yyyy, HH:mm'))}</p>
<div class="cards">
<div class="card"><h3>Spent</h3><div class="v">${escapeHtml(formatPaise(totals.expense, { alwaysDecimals: true }))}</div></div>
<div class="card"><h3>Received</h3><div class="v">${escapeHtml(formatPaise(totals.income, { alwaysDecimals: true }))}</div></div>
<div class="card"><h3>Transactions</h3><div class="v">${rows.length}</div></div>
</div>
${categoryRows ? `<h2>Spending by category</h2><table><thead><tr><th>Category</th><th style="text-align:right">Amount</th><th>Share</th></tr></thead><tbody>${categoryRows}</tbody></table>` : ''}
<h2>Transactions</h2>
<table><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Payee</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${txRows || '<tr><td colspan="5" style="text-align:center;color:#999">No transactions</td></tr>'}</tbody></table>
${truncated}
<p class="foot">Generated on your device by SpentSmart. Your data was not uploaded anywhere.</p>
</body></html>`;
}
