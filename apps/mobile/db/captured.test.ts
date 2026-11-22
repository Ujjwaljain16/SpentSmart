import { describe, expect, it } from 'vitest';
import { messageFingerprint } from '@spentsmart/finance/capture/fingerprint';
import { parsePaymentText } from '@spentsmart/finance/capture/payment-text';
import { createTestContext } from '@/tests/helpers/node-driver';
import { NewCaptured } from './repositories/captured';

const T = 1_790_000_000_000;
const MIN = 60_000;

const captured = (text: string, at: number, app = 'com.google.android.apps.nbu.paisa.user'): NewCaptured => {
  const p = parsePaymentText(text);
  if (!p) throw new Error(`not a payment: ${text}`);
  return { ...p, source: 'notification', app, occurredAt: at };
};

describe('captured payments inbox', () => {
  it('the UPI app notification and the bank SMS for one payment become one item, with details merged', async () => {
    const { repos } = await createTestContext();
    expect(await repos.captured.add(captured('₹432 paid to Zepto', T))).toBe('added');
    expect(await repos.captured.add(captured('Sent Rs.432.00 From HDFC Bank A/C *1234 To ZEPTO On 21/11/26 Ref 432112345678', T + 2 * MIN, 'com.google.android.apps.messaging'))).toBe('duplicate');
    const items = await repos.captured.listNew();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ payeeName: 'Zepto', reference: '432112345678', amountPaise: 43200 });
  });

  it('the same amount much later is a separate payment', async () => {
    const { repos } = await createTestContext();
    await repos.captured.add(captured('₹20 paid to Chai Point', T));
    expect(await repos.captured.add(captured('₹20 paid to Chai Point', T + 3 * 60 * MIN))).toBe('added');
    expect(await repos.captured.countNew()).toBe(2);
  });

  it('a payment already in the books (paid through SpentSmart) is not offered again', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert({ amountPaise: 34000, type: 'expense', categoryKey: 'food', payeeName: 'Zomato', paymentMethod: 'upi', verifiedBy: 'upi_result', occurredAt: T, source: 'scan' });
    expect(await repos.captured.add(captured('₹340 paid to Zomato', T + MIN))).toBe('already_recorded');
    expect(await repos.captured.countNew()).toBe(0);
  });

  it('recording a payment another way settles its waiting capture', async () => {
    const { repos } = await createTestContext();
    await repos.captured.add(captured('₹340 paid to Zomato', T));
    const txn = await repos.transactions.insert({ amountPaise: 34000, type: 'expense', categoryKey: 'food', payeeName: 'Zomato', paymentMethod: 'upi', verifiedBy: 'upi_result', occurredAt: T + MIN, source: 'scan' });
    await repos.captured.settleTwins('debit', 34000, T + MIN, txn.id);
    expect(await repos.captured.countNew()).toBe(0);
  });

  it('ignored items stay out of the inbox and still catch late duplicates', async () => {
    const { repos } = await createTestContext();
    await repos.captured.add(captured('₹340 paid to Zomato', T));
    const [item] = await repos.captured.listNew();
    await repos.captured.ignore(item!.id);
    expect(await repos.captured.add(captured('Rs 340 debited from A/c XX1234 to VPA zomato@ybl', T + MIN, 'com.android.mms'))).toBe('duplicate');
    expect(await repos.captured.countNew()).toBe(0);
  });

  it('a re-posted notification is never a new payment, even long after it was added or ignored', async () => {
    const { repos } = await createTestContext();
    const salary = 'Rs.60000.00 credited to HDFC Bank A/c XX1234 on 22-11-26 by NEFT ACME CORP';
    const atm = 'Rs.2000 withdrawn at ATM MG ROAD from A/c XX1234 on 22-11-26';
    const sms = 'com.google.android.apps.messaging';
    expect(await repos.captured.add(captured(salary, T, sms), messageFingerprint(sms, salary))).toBe('added');
    expect(await repos.captured.add(captured(atm, T, sms), messageFingerprint(sms, atm))).toBe('added');
    const [first, second] = await repos.captured.listNew();
    await repos.captured.ignore(first!.id);
    await repos.captured.markAdded(second!.id, null);

    // Messages re-posts every unread SMS when a new one arrives, here 20 minutes later.
    const later = T + 20 * MIN;
    expect(await repos.captured.add(captured(salary, later, sms), messageFingerprint(sms, salary))).toBe('duplicate');
    expect(await repos.captured.add(captured(atm, later, sms), messageFingerprint(sms, atm))).toBe('duplicate');
    expect(await repos.captured.countNew()).toBe(0);
  });

  it('captured rows are never queued for sync, and delete-all-data clears them', async () => {
    const { repos, driver } = await createTestContext();
    await repos.captured.add(captured('₹340 paid to Zomato', T));
    const queued = await driver.first<{ n: number }>("SELECT count(*) AS n FROM sync_outbox WHERE collection NOT IN ('accounts', 'categories')");
    expect(queued!.n).toBe(0);
    await repos.eraseEverything();
    expect(await repos.captured.countNew()).toBe(0);
  });
});
