import { endOfMonth, format, startOfMonth } from 'date-fns';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Repositories } from '@/db/repositories';
import { TransactionFilter } from '@/db/repositories/transactions';
import { buildCsv, buildReportHtml } from '@/domain/report';
import { periodRanges } from '@/domain/periods';
import { Transaction } from '@/domain/types';
import { log } from '@/lib/logger';

const PAGE = 1000;
/** A PDF cannot sensibly hold more rows than this; CSV has no limit. */
export const PDF_ROW_LIMIT = 2000;

export type ExportScope = { kind: 'all' } | { kind: 'year' } | { kind: 'month'; date: Date };

function filterFor(scope: ExportScope): TransactionFilter {
  switch (scope.kind) {
    case 'all':
      return {};
    case 'year': {
      const { current } = periodRanges('year', new Date());
      return { since: current.start, until: current.end };
    }
    case 'month':
      return { since: startOfMonth(scope.date).getTime(), until: endOfMonth(scope.date).getTime() + 1 };
  }
}

function titleFor(scope: ExportScope): string {
  switch (scope.kind) {
    case 'all':
      return 'All transactions';
    case 'year':
      return `Year ${new Date().getFullYear()}`;
    case 'month':
      return format(scope.date, 'MMMM yyyy');
  }
}

async function loadRows(repos: Repositories, filter: TransactionFilter, limit = Number.POSITIVE_INFINITY): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  let cursor = null;
  do {
    const page: Awaited<ReturnType<typeof repos.transactions.list>> = await repos.transactions.list(
      filter,
      Math.min(PAGE, limit - rows.length),
      cursor,
    );
    rows.push(...page.items);
    cursor = rows.length >= limit ? null : page.nextCursor;
  } while (cursor);
  return rows;
}

async function shareAndClean(file: File, mimeType: string, dialogTitle: string): Promise<void> {
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
    } else {
      throw new Error('Sharing is not available on this device.');
    }
  } finally {
    // The export contains financial data: never leave it behind in app storage.
    try {
      if (file.exists) file.delete();
    } catch (error) {
      log.warn('Could not delete temporary export', error);
    }
  }
}

export async function exportPdf(repos: Repositories, scope: ExportScope): Promise<void> {
  const filter = filterFor(scope);
  const [categories, total, rows] = await Promise.all([
    repos.categories.list(),
    repos.transactions.summarize(filter),
    loadRows(repos, filter, PDF_ROW_LIMIT),
  ]);

  const html = buildReportHtml({
    title: titleFor(scope),
    generatedAt: new Date(),
    rows,
    categories,
    truncatedFrom: total.count,
  });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await shareAndClean(new File(uri), 'application/pdf', 'Share expense report');
}

export async function exportCsv(repos: Repositories, scope: ExportScope): Promise<number> {
  const filter = filterFor(scope);
  const [categories, rows] = await Promise.all([repos.categories.list(), loadRows(repos, filter)]);

  const file = new File(Paths.cache, `SpentSmart-${format(new Date(), 'yyyyMMdd-HHmmss')}.csv`);
  file.create({ overwrite: true });
  file.write(buildCsv(rows, categories));
  await shareAndClean(file, 'text/csv', 'Share transactions (CSV)');
  return rows.length;
}
