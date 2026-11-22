import { describe, expect, it } from 'vitest';
import { parsePaymentText } from './payment-text';

describe('reading payments from notifications and SMS', () => {
  it.each([
    ['₹340 paid to Zomato', 'debit', 34000, 'Zomato'],
    ['Paid ₹432 to Zepto', 'debit', 43200, 'Zepto'],
    ['Paid Rs.120 to Chai Point', 'debit', 12000, 'Chai Point'],
    ['You paid ₹1,250.50 to Swiggy', 'debit', 125050, 'Swiggy'],
    ['Received ₹ 500 from Dhruv Jain', 'credit', 50000, 'Dhruv Jain'],
    ['Dhruv Jain sent you ₹500', 'credit', 50000, 'Dhruv Jain'],
  ])('UPI app: %s', (text, direction, amountPaise, payeeName) => {
    expect(parsePaymentText(text)).toMatchObject({ direction, amountPaise, payeeName });
  });

  it('HDFC UPI SMS', () => {
    const p = parsePaymentText('Sent Rs.432.00\nFrom HDFC Bank A/C *1234\nTo ZEPTO\nOn 21/11/26\nRef 432112345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808');
    expect(p).toMatchObject({ direction: 'debit', amountPaise: 43200, payeeName: 'Zepto', reference: '432112345678' });
  });

  it('SBI UPI SMS without a currency sign', () => {
    const p = parsePaymentText('Dear UPI user A/C X1234 debited by 432.0 on date 21Nov26 trf to ZEPTO Refno 432112345678. If not u? call 1800111109. -SBI');
    expect(p).toMatchObject({ direction: 'debit', amountPaise: 43200, payeeName: 'Zepto', reference: '432112345678', via: 'upi' });
  });

  it('ICICI UPI SMS names the payee before "credited"', () => {
    const p = parsePaymentText('ICICI Bank Acct XX123 debited for Rs 1850.00 on 21-Nov-26; ZOMATO credited. UPI:432112345678. Call 18002662 for dispute.');
    expect(p).toMatchObject({ direction: 'debit', amountPaise: 185000, payeeName: 'Zomato', reference: '432112345678' });
  });

  it('a VPA in the text is kept and used for the name when there is no other', () => {
    const p = parsePaymentText('Rs 432 debited from A/c XX1234 to VPA zepto.payments@ybl on 21-11-26');
    expect(p).toMatchObject({ direction: 'debit', amountPaise: 43200, payeeVpa: 'zepto.payments@ybl', payeeName: 'Zepto Payments' });
  });

  it('card spend skips the available limit', () => {
    const p = parsePaymentText('Spent Rs.1850 On HDFC Bank Card 1234 At ZOMATO On 2026-11-21:20:10:11 Avl Limit: Rs 50000');
    expect(p).toMatchObject({ direction: 'debit', amountPaise: 185000, payeeName: 'Zomato', via: 'card' });
  });

  it('salary credit names the payer from "by NEFT ..."', () => {
    expect(parsePaymentText('Rs.60000.00 credited to HDFC Bank A/c XX1234 on 01-11-26 by NEFT ACME CORP')).toMatchObject({
      direction: 'credit',
      amountPaise: 6000000,
      payeeName: 'Acme Corp',
    });
  });

  it('ATM withdrawal is marked so it can become a transfer to cash, and named plainly', () => {
    expect(parsePaymentText('Rs.2000 withdrawn at ATM MG ROAD from A/c XX1234')).toMatchObject({ direction: 'debit', amountPaise: 200000, via: 'atm', payeeName: 'ATM withdrawal' });
  });

  it.each([
    '432112 is your OTP for txn of Rs 432 at ZEPTO. Do not share it with anyone',
    'Use OTP 123456 to pay ₹340 to Zomato',
    'Dhruv has requested ₹500 from you',
    'Collect request of Rs 2000 from refund@upi',
    'Get ₹50 cashback on your next Zomato order',
    'Your bill of Rs 649 is due on 25 Nov',
    'Payment of ₹340 to Zomato failed',
    'Rs 999 will be debited on 25-11-26 for your Netflix mandate',
    'Avl Bal in A/c XX1234 is Rs 10,000.00 as on 21-11-26',
    'Hey, are we still on for dinner?',
    '',
  ])('rejects: %s', (text) => {
    expect(parsePaymentText(text)).toBeNull();
  });
});
