import { buildCsv } from '@spentsmart/finance/report';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '@/tests/helpers/node-driver';
import { commitImport, previewImport } from './statement-import';

/**
 * Backup drill: Settings → Export CSV, Settings → Delete all data, then import the export. Everything but transfers
 * (whose accounts the export doesn't record) must come back exactly.
 */
const NOW = new Date(2026, 10, 20, 12).getTime();
const at = (d: number, h = 10) => new Date(2026, 10, d, h, 30).getTime();

describe('backup drill', () => {
  it('export → delete all data → import restores every transaction except transfers', async () => {
    const { repos } = await createTestContext(NOW);
    const t = repos.transactions;
    await t.insert({ amountPaise: 34_000, type: 'expense', categoryKey: 'food', payeeName: 'Swiggy', payeeVpa: 'swiggy@ybl', paymentMethod: 'upi', verifiedBy: 'upi_result', upiTxnId: 'T1001', occurredAt: at(2) });
    await t.insert({ amountPaise: 15_000_00, type: 'expense', categoryKey: 'rent', payeeName: 'Landlord, "Sharma"', paymentMethod: 'bank', verifiedBy: 'manual', note: '=Nov rent, flat 4B', occurredAt: at(3) });
    await t.insert({ amountPaise: 60_000_00, type: 'income', categoryKey: 'income', payeeName: 'Acme', paymentMethod: 'bank', verifiedBy: 'manual', occurredAt: at(1) });
    await t.insert({ amountPaise: 1_299_00, type: 'refund', categoryKey: 'other', payeeName: 'Myntra', paymentMethod: 'upi', verifiedBy: 'manual', occurredAt: at(5) });
    await t.insert({ amountPaise: 2_000, type: 'expense', categoryKey: 'food', payeeName: 'Chai', paymentMethod: 'cash', verifiedBy: 'manual', note: 'with team', occurredAt: at(6, 17) });
    await t.createTransfer({ fromAccountId: 'default-bank', toAccountId: 'default-cash', amountPaise: 2_000_00, occurredAt: at(10) });

    const before = await repos.analytics.insights('month', new Date(NOW));
    const all = (await t.list({}, 100)).items;
    const csv = buildCsv(all, await repos.categories.list());

    await repos.eraseEverything();
    expect(await t.count()).toBe(0);

    const preview = await previewImport(repos, csv, 'default-bank');
    expect(preview).toMatchObject({ restore: true, transfersSkipped: 2, duplicates: 0, skipped: [] });
    expect(await commitImport(repos, preview.fresh, 'default-bank')).toBe(5);

    const after = await repos.analytics.insights('month', new Date(NOW));
    expect(after.incomePaise).toBe(before.incomePaise);
    expect(after.expensePaise).toBe(before.expensePaise);
    expect(after.categories.map((c) => [c.categoryKey, c.amountPaise])).toEqual(before.categories.map((c) => [c.categoryKey, c.amountPaise]));

    const restored = (await t.list({}, 100)).items;
    const rent = restored.find((x) => x.categoryKey === 'rent')!;
    expect(rent).toMatchObject({ payeeName: 'Landlord, "Sharma"', note: '=Nov rent, flat 4B', paymentMethod: 'bank', occurredAt: at(3) });
    expect(restored.find((x) => x.payeeName === 'Swiggy')).toMatchObject({ payeeVpa: 'swiggy@ybl', upiTxnRef: 'T1001' });
    expect(restored.find((x) => x.type === 'refund')).toMatchObject({ payeeName: 'Myntra', amountPaise: 1_299_00 });
    expect(restored.find((x) => x.payeeName === 'Chai')).toMatchObject({ note: 'with team', paymentMethod: 'cash' });

    // Importing the same backup again adds nothing.
    expect((await previewImport(repos, csv, 'default-bank')).fresh).toEqual([]);
  });

  it('a category that no longer exists comes back as Other', async () => {
    const { repos } = await createTestContext(NOW);
    const travel = await repos.categories.add({ label: 'Travel', icon: 'airplane', color: '#000' });
    await repos.transactions.insert({ amountPaise: 4_500_00, type: 'expense', categoryKey: travel.key, payeeName: 'IndiGo', paymentMethod: 'upi', verifiedBy: 'manual', occurredAt: at(4) });
    const csv = buildCsv((await repos.transactions.list({}, 10)).items, await repos.categories.list());
    await repos.eraseEverything();
    const preview = await previewImport(repos, csv, 'default-bank');
    expect(preview.fresh.map((r) => [r.payeeName, r.categoryKey])).toEqual([['IndiGo', 'other']]);
  });
});
