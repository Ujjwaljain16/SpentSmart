import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { ExistingTxn, findDuplicates, parseStatement, parseStatementAmount, parseStatementDate, readNarration, UnreadableStatementError } from './statement';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe('parseCsv', () => {
  it('handles quotes, embedded commas and newlines, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,"two\nlines",3\r\n\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', 'two\nlines', '3'],
    ]);
  });
});

describe('dates and amounts', () => {
  it.each([
    ['15/11/2026', day(2026, 11, 15)],
    ['15-11-2026', day(2026, 11, 15)],
    ['15/11/26', day(2026, 11, 15)],
    ['2026-11-15', day(2026, 11, 15)],
    ['15-Nov-2026', day(2026, 11, 15)],
    ['15 Nov 2026', day(2026, 11, 15)],
    ['05/03/2026', day(2026, 3, 5)],
    ['15/11/2026 14:32:10', day(2026, 11, 15)],
    ['Nov 15, 2026', day(2026, 11, 15)],
  ])('date %s', (text, expected) => {
    expect(parseStatementDate(text)).toBe(expected);
  });

  it('rejects things that are not dates', () => {
    expect(parseStatementDate('Opening Balance')).toBeNull();
    expect(parseStatementDate('31/02/2026')).toBeNull();
  });

  it.each([
    ['1,23,456.70', 1_23_456_70],
    ['₹ 250', 250_00],
    ['INR 99.5', 99_50],
    ['(500.00)', -500_00],
    ['-500', -500_00],
    ['250.00 Dr', -250_00],
    ['250.00 Cr', 250_00],
    ['', null],
    ['-', null],
    ['abc', null],
  ])('amount %s', (text, expected) => {
    expect(parseStatementAmount(text)).toBe(expected);
  });
});

describe('readNarration', () => {
  it.each([
    ['UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl/Payment', 'Swiggy', 'swiggy@ybl', '412345678901'],
    ['UPI-SWIGGY-SWIGGY@YBL-YESB0000001-412345678901-UPI', 'Swiggy', 'swiggy@ybl', '412345678901'],
    ['UPI/412345678901/Rahul Kumar/rahul.k@okaxis/', 'Rahul Kumar', 'rahul.k@okaxis', '412345678901'],
    ['NEFT DR-HDFC0000001-ACME TECHNOLOGIES-NETBANK', 'Acme Technologies Netbank', null, null],
    ['POS 4111XXXXXXXX1111 DMART POWAI', 'Dmart Powai', null, null],
  ])('%s', (text, name, vpa, ref) => {
    expect(readNarration(text)).toEqual({ payeeName: name, payeeVpa: vpa, reference: ref });
  });
});

describe('parseStatement', () => {
  it('reads a debit/credit export with account details above the table and a footer', () => {
    const csv = [
      'Account Statement,,,,,,',
      'Account No,XXXXXXXX1234,,,,,',
      ',,,,,,',
      'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
      '01/11/26,NEFT CR-ACME TECHNOLOGIES-SALARY NOV,0000000000000000,01/11/26,,"60,000.00","72,500.00"',
      '02/11/26,UPI-SWIGGY-SWIGGY@YBL-YESB0000001-412345678901-UPI,0000412345678901,02/11/26,340.00,,"72,160.00"',
      '03/11/26,UPI/DR/512345678902/Landlord Sharma/SBIN/landlord@oksbi/rent,0000512345678902,03/11/26,"15,000.00",,"57,160.00"',
      ',,,,,,',
      'Opening Balance,Dr Count,Cr Count,Debits,Credits,Closing Bal,',
      '"12,500.00",2,1,"15,340.00","60,000.00","57,160.00",',
    ].join('\n');
    const out = parseStatement(csv);
    expect(out.columns).toEqual({ date: 'Date', description: 'Narration', amount: 'Withdrawal Amt. / Deposit Amt.' });
    expect(out.rows.map((r) => [r.line, r.type, r.amountPaise, r.payeeName, r.payeeVpa, r.reference])).toEqual([
      [5, 'income', 60_000_00, 'Acme Technologies Salary Nov', null, null],
      [6, 'expense', 340_00, 'Swiggy', 'swiggy@ybl', '412345678901'],
      [7, 'expense', 15_000_00, 'Landlord Sharma', 'landlord@oksbi', '512345678902'],
    ]);
    expect(out.rows[0]!.occurredAt).toBe(day(2026, 11, 1));
    // The summary footer has values but no date, so both its lines are reported rather than silently dropped.
    expect(out.skipped).toEqual([{ line: 9, reason: 'no readable date' }, { line: 10, reason: 'no readable date' }]);
  });

  it('reads a single amount column with a Dr/Cr flag', () => {
    const csv = ['Txn Date,Description,Amount,Dr/Cr,Ref No', '15-Nov-2026,AMAZON PAY INDIA,"1,299.00",DR,ABC123', '16-Nov-2026,REFUND AMAZON,"1,299.00",CR,ABC124'].join('\n');
    const out = parseStatement(csv);
    expect(out.rows.map((r) => [r.type, r.amountPaise, r.reference])).toEqual([
      ['expense', 1_299_00, 'ABC123'],
      ['income', 1_299_00, 'ABC124'],
    ]);
  });

  it('reads signed amounts without a flag', () => {
    const out = parseStatement(['Date,Details,Amount', '2026-11-15,Chai,-20', '2026-11-16,Cashback,15'].join('\n'));
    expect(out.rows.map((r) => [r.type, r.amountPaise])).toEqual([['expense', 2_000], ['income', 1_500]]);
  });

  it('reports rows it could not read', () => {
    const out = parseStatement(['Date,Narration,Debit,Credit', '15/11/2026,Something,,', 'not a date,Other,10,', '16/11/2026,Fine,10,'].join('\n'));
    expect(out.rows).toHaveLength(1);
    expect(out.skipped).toEqual([{ line: 2, reason: 'no amount' }, { line: 3, reason: 'no readable date' }]);
  });

  it('refuses files without the columns it needs', () => {
    expect(() => parseStatement('Name,Phone\nA,1')).toThrow(UnreadableStatementError);
    expect(() => parseStatement('')).toThrow(UnreadableStatementError);
  });
});

describe('findDuplicates', () => {
  const row = (over: Partial<Parameters<typeof findDuplicates>[0][number]> = {}) => ({
    line: 1, occurredAt: day(2026, 11, 2), amountPaise: 340_00, type: 'expense' as const, payeeName: 'Swiggy', payeeVpa: null, reference: null, description: '', ...over,
  });
  const existing = (over: Partial<ExistingTxn> = {}): ExistingTxn => ({
    id: 'e1', occurredAt: day(2026, 11, 2), amountPaise: 340_00, type: 'expense', payeeName: 'Swiggy', payeeVpa: null, upiTxnRef: null, upiTxnId: null, ...over,
  });

  it('matches on the UPI reference whatever the date and name say', () => {
    const r = findDuplicates([row({ reference: '412345678901', payeeName: 'Bundl Technologies', occurredAt: day(2026, 11, 5) })], [existing({ upiTxnRef: '412345678901' })]);
    expect(r.duplicates.map((d) => d.matchId)).toEqual(['e1']);
  });

  it('matches same amount, direction, nearby day and similar payee', () => {
    expect(findDuplicates([row({ payeeName: 'SWIGGY BANGALORE', occurredAt: day(2026, 11, 3) })], [existing()]).duplicates).toHaveLength(1);
  });

  it('keeps rows that differ in amount, direction, date or payee', () => {
    const e = [existing()];
    expect(findDuplicates([row({ amountPaise: 341_00 })], e).fresh).toHaveLength(1);
    expect(findDuplicates([row({ type: 'income' })], e).fresh).toHaveLength(1);
    expect(findDuplicates([row({ occurredAt: day(2026, 11, 5) })], e).fresh).toHaveLength(1);
    expect(findDuplicates([row({ payeeName: 'Zomato' })], e).fresh).toHaveLength(1);
  });

  it('uses UPI IDs when both sides have one', () => {
    expect(findDuplicates([row({ payeeVpa: 'swiggy@ybl', payeeName: 'X' })], [existing({ payeeVpa: 'SWIGGY@YBL', payeeName: 'Y' })]).duplicates).toHaveLength(1);
    expect(findDuplicates([row({ payeeVpa: 'other@ybl' })], [existing({ payeeVpa: 'swiggy@ybl' })]).fresh).toHaveLength(1);
  });

  it('one recorded transaction absorbs only one imported row', () => {
    const chai = (line: number) => row({ line, amountPaise: 20_00, payeeName: 'Chai Point' });
    const r = findDuplicates([chai(1), chai(2)], [existing({ amountPaise: 20_00, payeeName: 'Chai Point' })]);
    expect(r.duplicates).toHaveLength(1);
    expect(r.fresh.map((f) => f.line)).toEqual([2]);
  });

  it('a bank-to-cash transfer recorded in the app matches the ATM withdrawal', () => {
    expect(findDuplicates([row({ payeeName: 'ATM Cash', amountPaise: 2000_00 })], [existing({ type: 'transfer', amountPaise: 2000_00, payeeName: 'To Cash' })]).duplicates).toHaveLength(1);
  });
});
