import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './categories';
import { buildCsv, buildReportHtml, csvCell, escapeHtml, safeColor } from './report';
import { Transaction } from './types';

const base: Transaction = {
  id: '1',
  amountPaise: 125050,
  type: 'expense',
  categoryKey: 'food',
  payeeName: 'Cafe',
  payeeVpa: 'cafe@ybl',
  paymentMethod: 'upi',
  note: 'lunch',
  occurredAt: new Date(2026, 5, 17, 13, 5).getTime(),
  createdAt: 0,
  verifiedBy: 'user',
  upiTxnId: 'T1',
  upiTxnRef: null,
  attemptId: null,
};

describe('escapeHtml / safeColor', () => {
  it('escapes markup', () => {
    expect(escapeHtml(`<img src="https://evil/x" onerror='a'>&`)).toBe('&lt;img src=&quot;https://evil/x&quot; onerror=&#39;a&#39;&gt;&amp;');
  });
  it('only accepts #RRGGBB colours', () => {
    expect(safeColor('#14B8A6')).toBe('#14B8A6');
    expect(safeColor('red;background:url(x)')).toBe('#6B7280');
  });
});

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(5)).toBe('5');
  });

  it('neutralises spreadsheet formula injection from hostile payee names', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+91 98765')).toBe("'+91 98765");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5'); // numbers are real numbers, not formulas
  });

  it('builds header and rows with exact decimal amounts', () => {
    const csv = buildCsv([base], DEFAULT_CATEGORIES);
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toContain('Amount (INR)');
    expect(row).toBe('2026-06-17,13:05,expense,1250.50,Food,Cafe,cafe@ybl,upi,lunch,user,T1');
  });
});

describe('report html', () => {
  it('escapes every dynamic value (regression: payee names went into the PDF unescaped)', () => {
    const html = buildReportHtml({
      title: '<b>t</b>',
      generatedAt: new Date(2026, 5, 17),
      rows: [{ ...base, payeeName: '<img src="https://tracker.example/p.png">', note: '<script>alert(1)</script>' }],
      categories: [{ ...DEFAULT_CATEGORIES[0]!, color: 'red;x:url(//evil)' }],
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('url(//evil)');
    expect(html).toContain('&lt;img');
  });

  it('shows totals and a truncation notice', () => {
    const html = buildReportHtml({
      title: 'All',
      generatedAt: new Date(2026, 5, 17),
      rows: [base, { ...base, id: '2', type: 'income', categoryKey: 'income', amountPaise: 100 }],
      categories: DEFAULT_CATEGORIES,
      truncatedFrom: 50,
    });
    expect(html).toContain('₹1,250.50');
    expect(html).toContain('Showing the latest 2 of 50');
  });

  it('handles an empty report', () => {
    expect(buildReportHtml({ title: 'x', generatedAt: new Date(), rows: [], categories: DEFAULT_CATEGORIES })).toContain('No transactions');
  });
});
