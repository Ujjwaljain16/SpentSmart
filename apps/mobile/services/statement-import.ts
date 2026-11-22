import { learnCategories, parseQuickAdd } from '@spentsmart/finance/quick-add';
import { isSpentSmartExport, parseSpentSmartExport } from '@spentsmart/finance/import/export-restore';
import { StatementRow, findDuplicates, parseStatement } from '@spentsmart/finance/import/statement';
import { PaymentMethod } from '@spentsmart/finance/types';
import { INCOME_CATEGORY_KEY } from '@spentsmart/finance/categories';
import { DEFAULT_CASH_ACCOUNT_ID } from '@/db/migrations';
import { Repositories } from '@/db/repositories';

/** ATM and cash-withdrawal narrations: money moving to the Cash account, not spending. */
const CASH_WITHDRAWAL = /\b(atm|nwd|cash\s*wdl|cash\s*withdrawal|atw)\b/i;

export interface ImportPreview {
  /** Rows not already in the app, each with the category the merchant dictionary suggests. */
  fresh: ImportRow[];
  /** SpentSmart's own export (a backup) rather than a bank statement. */
  restore: boolean;
  /** Transfers in a restored export: left out, since the export doesn't record the accounts. */
  transfersSkipped: number;
  duplicates: number;
  skipped: { line: number; reason: string }[];
  columns: { date: string; description: string; amount: string };
}

export type ImportRow = Omit<StatementRow, 'type'> & {
  type: 'expense' | 'income' | 'refund';
  categoryKey: string;
  toCash: boolean;
  /** Known exactly when restoring an export; guessed from the narration for statements. */
  paymentMethod?: PaymentMethod;
  note?: string | null;
};

async function existingAround(repos: Repositories, times: number[], accountId: string) {
  const since = Math.min(...times) - 2 * 86_400_000;
  const until = Math.max(...times) + 2 * 86_400_000;
  const existing = [];
  let cursor = null;
  do {
    const page = await repos.transactions.list({ since, until, accountId }, 500, cursor);
    existing.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return existing;
}

/** Read a statement and compare it with what's already recorded around the same dates. Changes nothing. */
export async function previewImport(repos: Repositories, csvText: string, accountId: string): Promise<ImportPreview> {
  if (isSpentSmartExport(csvText)) {
    const restored = parseSpentSmartExport(csvText, await repos.categories.list());
    const asRows: ImportRow[] = restored.rows.map((r) => ({
      line: r.line,
      occurredAt: r.occurredAt,
      amountPaise: r.amountPaise,
      type: r.type,
      payeeName: r.payeeName,
      payeeVpa: r.payeeVpa,
      reference: r.upiTxnId,
      description: r.payeeName,
      categoryKey: r.categoryKey,
      toCash: false,
      paymentMethod: r.paymentMethod,
      note: r.note,
    }));
    const existing = asRows.length > 0 ? await existingAround(repos, asRows.map((r) => r.occurredAt), accountId) : [];
    const { fresh, duplicates } = findDuplicates(asRows as unknown as StatementRow[], existing);
    return {
      fresh: fresh as unknown as ImportRow[],
      duplicates: duplicates.length,
      skipped: restored.skipped,
      columns: { date: 'Date', description: 'Payee', amount: 'Amount (INR)' },
      restore: true,
      transfersSkipped: restored.skippedTransfers,
    };
  }

  const parsed = parseStatement(csvText);
  if (parsed.rows.length === 0) return { fresh: [], duplicates: 0, skipped: parsed.skipped, columns: parsed.columns, restore: false, transfersSkipped: 0 };

  const existing = await existingAround(repos, parsed.rows.map((r) => r.occurredAt), accountId);

  const { fresh, duplicates } = findDuplicates(parsed.rows, existing);
  const categories = await repos.categories.list();
  const learned = learnCategories((await repos.transactions.list({ type: 'expense' }, 500)).items);
  return {
    fresh: fresh.map((row) => ({
      ...row,
      toCash: row.type === 'expense' && accountId !== DEFAULT_CASH_ACCOUNT_ID && CASH_WITHDRAWAL.test(row.description),
      // The quick-add merchant dictionary already knows "Swiggy" is food; reuse it for bank narrations.
      categoryKey: row.type === 'income' ? INCOME_CATEGORY_KEY : parseQuickAdd(row.payeeName, categories, new Date(row.occurredAt), { learned }).categoryKey,
    })),
    duplicates: duplicates.length,
    skipped: parsed.skipped,
    columns: parsed.columns,
    restore: false,
    transfersSkipped: 0,
  };
}

/** Save previewed rows into one account; cash withdrawals become transfers to Cash. All or nothing. */
export async function commitImport(repos: Repositories, rows: ImportPreview['fresh'], accountId: string): Promise<number> {
  return repos.transactions.insertMany(
    rows.filter((r) => !r.toCash).map((r) => ({
      amountPaise: r.amountPaise,
      type: r.type,
      categoryKey: r.categoryKey,
      payeeName: r.payeeName,
      payeeVpa: r.payeeVpa,
      paymentMethod: r.paymentMethod ?? (r.payeeVpa || /^upi/i.test(r.description) ? ('upi' as const) : ('bank' as const)),
      note: r.note ?? null,
      occurredAt: r.occurredAt,
      verifiedBy: 'manual' as const,
      upiTxnRef: r.reference,
      accountId,
      source: 'import' as const,
    })),
    rows
      .filter((r) => r.toCash)
      .map((r) => ({ fromAccountId: accountId, toAccountId: DEFAULT_CASH_ACCOUNT_ID, amountPaise: r.amountPaise, occurredAt: r.occurredAt, note: r.payeeName })),
  );
}
