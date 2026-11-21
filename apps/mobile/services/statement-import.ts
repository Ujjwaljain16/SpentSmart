import { parseQuickAdd } from '@spentsmart/finance/quick-add';
import { StatementRow, findDuplicates, parseStatement } from '@spentsmart/finance/import/statement';
import { INCOME_CATEGORY_KEY } from '@spentsmart/finance/categories';
import { Repositories } from '@/db/repositories';

export interface ImportPreview {
  /** Rows not already in the app, each with the category the merchant dictionary suggests. */
  fresh: (StatementRow & { categoryKey: string })[];
  duplicates: number;
  skipped: { line: number; reason: string }[];
  columns: { date: string; description: string; amount: string };
}

/** Read a statement and compare it with what's already recorded around the same dates. Changes nothing. */
export async function previewImport(repos: Repositories, csvText: string, accountId: string): Promise<ImportPreview> {
  const parsed = parseStatement(csvText);
  if (parsed.rows.length === 0) return { fresh: [], duplicates: 0, skipped: parsed.skipped, columns: parsed.columns };

  const times = parsed.rows.map((r) => r.occurredAt);
  const since = Math.min(...times) - 2 * 86_400_000;
  const until = Math.max(...times) + 2 * 86_400_000;
  const existing = [];
  let cursor = null;
  do {
    const page = await repos.transactions.list({ since, until, accountId }, 500, cursor);
    existing.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const { fresh, duplicates } = findDuplicates(parsed.rows, existing);
  const categories = await repos.categories.list();
  return {
    fresh: fresh.map((row) => ({
      ...row,
      // The quick-add merchant dictionary already knows "Swiggy" is food; reuse it for bank narrations.
      categoryKey: row.type === 'income' ? INCOME_CATEGORY_KEY : parseQuickAdd(row.payeeName, categories, new Date(row.occurredAt)).categoryKey,
    })),
    duplicates: duplicates.length,
    skipped: parsed.skipped,
    columns: parsed.columns,
  };
}

/** Save previewed rows into one account. All or nothing. */
export async function commitImport(repos: Repositories, rows: ImportPreview['fresh'], accountId: string): Promise<number> {
  await repos.transactions.insertMany(
    rows.map((r) => ({
      amountPaise: r.amountPaise,
      type: r.type,
      categoryKey: r.categoryKey,
      payeeName: r.payeeName,
      payeeVpa: r.payeeVpa,
      paymentMethod: r.payeeVpa || /^upi/i.test(r.description) ? ('upi' as const) : ('bank' as const),
      note: null,
      occurredAt: r.occurredAt,
      verifiedBy: 'manual' as const,
      upiTxnRef: r.reference,
      accountId,
      source: 'import' as const,
    })),
  );
  return rows.length;
}
