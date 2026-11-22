import { describe, expect, it } from 'vitest';
import { readReceipt } from './receipt';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe('readReceipt', () => {
  it('a restaurant bill with GST, sub total and grand total', () => {
    const r = readReceipt([
      'TRUFFLES',
      'Koramangala, Bengaluru',
      'GSTIN: 29AAAAA0000A1Z5',
      'TAX INVOICE',
      'Bill No: 4521   Date: 15/11/2026',
      'Burger            2   560.00',
      'Cold Coffee       1   180.00',
      'Sub Total             740.00',
      'CGST 2.5%              18.50',
      'SGST 2.5%              18.50',
      'Grand Total           777.00',
      'Thank you! Visit again',
    ]);
    expect(r).toEqual({ amountPaise: 777_00, merchant: 'Truffles', occurredAt: day(2026, 11, 15), confidence: 'high', amountLine: 'Grand Total 777.00' });
  });

  it('a supermarket bill where OCR splits the total onto the next line and lists savings', () => {
    const r = readReceipt([
      'D-Mart',
      'Avenue Supermarts Ltd',
      'Cash Memo',
      '12-Nov-2026 18:42',
      'Toor Dal 1kg 165.00',
      'Amul Milk 500ml 28.00',
      'Total Qty: 2',
      'You saved Rs 12.00',
      'Net Amount',
      'Rs. 193.00',
      'Cash Tendered 200.00',
      'Change 7.00',
    ]);
    expect(r).toMatchObject({ amountPaise: 193_00, merchant: 'D-Mart', occurredAt: day(2026, 11, 12), confidence: 'high' });
  });

  it('prefers grand total over total and ignores item lines that mention totals', () => {
    const r = readReceipt(['Cafe', 'Total Fitness Shake  ₹250', 'Total 250.00', 'Service charge 25.00', 'Grand Total 275.00']);
    expect(r.amountPaise).toBe(275_00);
  });

  it('falls back to the largest amount, marked low confidence', () => {
    const r = readReceipt(['Chai Point', '2 x Masala Chai 40.00', '1 x Samosa 25.00', 'Paid by UPI ₹65.00']);
    expect(r).toMatchObject({ amountPaise: 65_00, confidence: 'low' });
  });

  it('ignores phone numbers, bill numbers and quantities', () => {
    const r = readReceipt(['Sharma Medicals', 'Ph: 9876543210', 'Bill No 77881', 'Qty 3', 'Total ₹ 312.50']);
    expect(r).toMatchObject({ amountPaise: 312_50, merchant: 'Sharma Medicals' });
  });

  it('dates with dots and two-digit years', () => {
    expect(readReceipt(['Shop', 'Date 05.11.26', 'Total 10.00']).occurredAt).toBe(day(2026, 11, 5));
  });

  it('returns nothing it is unsure of rather than guessing', () => {
    expect(readReceipt(['TAX INVOICE', 'Thank you'])).toEqual({ amountPaise: null, merchant: null, occurredAt: null, confidence: 'low', amountLine: null });
    expect(readReceipt([])).toMatchObject({ amountPaise: null, merchant: null });
  });
});
