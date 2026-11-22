import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/tests/helpers/node-driver';
import { commitImport, previewImport } from './statement-import';

const STATEMENT = [
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '01/11/26,NEFT CR-ACME TECHNOLOGIES-SALARY NOV,0,01/11/26,,"60,000.00","72,500.00"',
  '02/11/26,UPI-SWIGGY-SWIGGY@YBL-YESB0000001-412345678901-UPI,0,02/11/26,340.00,,"72,160.00"',
  '03/11/26,UPI/DR/512345678902/Landlord/SBIN/landlord@oksbi/rent,0,03/11/26,"15,000.00",,"57,160.00"',
  '04/11/26,UPI/DR/612345678903/Chai Point/YESB/chaipoint@ybl/tea,0,04/11/26,20.00,,"57,140.00"',
].join('\n');

const NOW = new Date(2026, 10, 20, 12).getTime();

describe('statement import', () => {
  it('previews new rows with suggested categories and skips what is already recorded', async () => {
    const { repos } = await createTestContext(NOW);
    // Already scanned and paid in the app: the Swiggy order, with its UPI reference.
    await repos.transactions.insert({ amountPaise: 340_00, type: 'expense', categoryKey: 'food', payeeName: 'Swiggy', payeeVpa: 'swiggy@ybl', paymentMethod: 'upi', verifiedBy: 'upi_result', upiTxnRef: '412345678901', occurredAt: new Date(2026, 10, 2, 20).getTime() });

    const preview = await previewImport(repos, STATEMENT, 'default-bank');
    expect(preview.duplicates).toBe(1);
    expect(preview.fresh.map((r) => [r.payeeName, r.type, r.amountPaise, r.categoryKey])).toEqual([
      ['Acme Technologies Salary Nov', 'income', 60_000_00, 'income'],
      ['Landlord', 'expense', 15_000_00, 'rent'],
      ['Chai Point', 'expense', 20_00, 'food'],
    ]);
    // Preview changes nothing.
    expect(await repos.transactions.count()).toBe(1);
  });

  it('commits the preview into the chosen account, and a second import finds nothing new', async () => {
    const { repos } = await createTestContext(NOW);
    const preview = await previewImport(repos, STATEMENT, 'default-bank');
    expect(await commitImport(repos, preview.fresh, 'default-bank')).toBe(4);

    const saved = (await repos.transactions.list({}, 10)).items;
    expect(saved).toHaveLength(4);
    expect(saved.every((t) => t.source === 'import' && t.accountId === 'default-bank')).toBe(true);
    expect(saved.find((t) => t.payeeName === 'Swiggy')).toMatchObject({ paymentMethod: 'upi', upiTxnRef: '412345678901', payeeVpa: 'swiggy@ybl' });

    const again = await previewImport(repos, STATEMENT, 'default-bank');
    expect(again).toMatchObject({ fresh: [], duplicates: 4 });
  });

  it('only compares against the account being imported into', async () => {
    const { repos } = await createTestContext(NOW);
    await repos.transactions.insert({ amountPaise: 20_00, type: 'expense', categoryKey: 'food', payeeName: 'Chai Point', paymentMethod: 'cash', verifiedBy: 'manual', occurredAt: new Date(2026, 10, 4, 9).getTime() });
    // The cash chai is a different payment from the UPI chai in the bank statement.
    expect((await previewImport(repos, STATEMENT, 'default-bank')).duplicates).toBe(0);
  });

  it('an ATM withdrawal becomes a transfer to Cash, not spending', async () => {
    const { repos } = await createTestContext(NOW);
    const csv = STATEMENT + '\n10/11/26,ATM CASH WDL MG ROAD,0,10/11/26,"2,000.00",,"55,140.00"';
    const preview = await previewImport(repos, csv, 'default-bank');
    expect(preview.fresh.filter((r) => r.toCash).map((r) => r.amountPaise)).toEqual([2_000_00]);
    expect(await commitImport(repos, preview.fresh, 'default-bank')).toBe(5);

    const accounts = await repos.accounts.list();
    expect(accounts.find((a) => a.id === 'default-cash')!.balancePaise).toBe(2_000_00);
    const transfers = (await repos.transactions.list({ type: 'transfer' }, 10)).items;
    expect(transfers.map((t) => t.transferRole).sort()).toEqual(['in', 'out']);
    // Spending this month leaves the withdrawal out.
    const summary = await repos.analytics.insights('month', new Date(NOW));
    expect(summary.expensePaise).toBe(15_000_00 + 340_00 + 20_00);
    // Importing again recognises the transfer and adds nothing.
    expect((await previewImport(repos, csv, 'default-bank')).fresh).toEqual([]);
  });

  it('a failure halfway saves nothing', async () => {
    const { repos } = await createTestContext(NOW);
    const preview = await previewImport(repos, STATEMENT, 'default-bank');
    const broken = [...preview.fresh];
    broken[2] = { ...broken[2]!, amountPaise: -5 };
    await expect(commitImport(repos, broken, 'default-bank')).rejects.toThrow();
    expect(await repos.transactions.count()).toBe(0);
  });
});
