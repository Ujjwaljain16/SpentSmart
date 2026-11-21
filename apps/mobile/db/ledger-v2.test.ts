import { describe, expect, it } from 'vitest';
import { NewTransaction } from '@spentsmart/finance/types';
import { createNodeDriver, createTestContext } from '@/tests/helpers/node-driver';
import { DEFAULT_BANK_ACCOUNT_ID, DEFAULT_CASH_ACCOUNT_ID, MIGRATIONS, migrate } from './migrations';
import { ValidationError } from './repositories/transactions';

const JUNE_17 = new Date(2026, 5, 17, 12, 0);
const at = (day: number, month = 5) => new Date(2026, month, day, 10, 0).getTime();

const tx = (over: Partial<NewTransaction> = {}): NewTransaction => ({
  amountPaise: 10_000,
  type: 'expense',
  categoryKey: 'food',
  payeeName: 'Cafe',
  paymentMethod: 'upi',
  verifiedBy: 'manual',
  ...over,
});

describe('migration v1 -> v2 on a real v1 database', () => {
  it('keeps every transaction and amount, assigns accounts and sources, moves the budget', async () => {
    const { driver, raw } = createNodeDriver();
    await migrate(driver, MIGRATIONS.slice(0, 1));

    const insertV1 = raw.prepare(
      `INSERT INTO transactions (id, amount_paise, type, category_key, payee_name, payee_vpa, payment_method, note, occurred_at, created_at, verified_by, attempt_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertV1.run('a', 12_345, 'expense', 'food', 'Cafe', 'cafe@ybl', 'upi', 'chai', 1000, 1000, 'upi_result', 'attempt-1');
    insertV1.run('b', 50_000, 'expense', 'rent', 'Landlord', null, 'cash', null, 2000, 2000, 'manual', null);
    insertV1.run('c', 500_000, 'income', 'income', 'Employer', null, 'bank', 'salary', 3000, 3000, 'manual', null);
    insertV1.run('d', 999, 'expense', 'transfer', 'Odd category name', null, 'upi', null, 4000, 4000, 'manual', null);
    raw.prepare("INSERT INTO categories (key, label, icon, color, sort_order, is_system) VALUES ('transfer', 'Transfer', 'car', '#000000', 9, 0)").run();
    raw.prepare("INSERT INTO settings (key, value) VALUES ('budgetPaise', '1500000'), ('profileName', 'Asha')").run();

    await migrate(driver);

    const rows = raw.prepare('SELECT id, amount_paise, account_id, source, version, category_key, deleted_at FROM transactions ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'a', amount_paise: 12_345, account_id: DEFAULT_BANK_ACCOUNT_ID, source: 'scan', version: 1, category_key: 'food', deleted_at: null },
      { id: 'b', amount_paise: 50_000, account_id: DEFAULT_CASH_ACCOUNT_ID, source: 'manual', version: 1, category_key: 'rent', deleted_at: null },
      { id: 'c', amount_paise: 500_000, account_id: DEFAULT_BANK_ACCOUNT_ID, source: 'manual', version: 1, category_key: 'income', deleted_at: null },
      { id: 'd', amount_paise: 999, account_id: DEFAULT_BANK_ACCOUNT_ID, source: 'manual', version: 1, category_key: 'transfer-custom', deleted_at: null },
    ]);
    expect(raw.prepare("SELECT key, is_system FROM categories WHERE key LIKE 'transfer%' ORDER BY key").all()).toEqual([
      { key: 'transfer', is_system: 1 },
      { key: 'transfer-custom', is_system: 0 },
    ]);
    expect(raw.prepare('SELECT category_key, limit_paise FROM budgets').all()).toEqual([{ category_key: null, limit_paise: 1_500_000 }]);
    expect(raw.prepare("SELECT key FROM settings WHERE key = 'budgetPaise'").all()).toEqual([]);
    expect(raw.prepare("SELECT value FROM settings WHERE key = 'profileName'").get()).toEqual({ value: 'Asha' });
    expect(raw.prepare("SELECT id FROM transactions WHERE attempt_id = 'attempt-1'").get()).toEqual({ id: 'a' });
  });

  it('works on an empty v1 database and skips a zero budget', async () => {
    const { driver, raw } = createNodeDriver();
    await migrate(driver, MIGRATIONS.slice(0, 1));
    raw.prepare("INSERT INTO settings (key, value) VALUES ('budgetPaise', '0')").run();
    await migrate(driver);
    expect(raw.prepare('SELECT COUNT(*) AS c FROM budgets').get()).toEqual({ c: 0 });
    expect(raw.prepare('SELECT id FROM accounts ORDER BY sort_order').all()).toEqual([{ id: DEFAULT_BANK_ACCOUNT_ID }, { id: DEFAULT_CASH_ACCOUNT_ID }]);
  });
});

describe('accounts and transfers', () => {
  it('routes cash payments to the cash account and everything else to the bank account', async () => {
    const { repos } = await createTestContext();
    expect((await repos.transactions.insert(tx({ paymentMethod: 'cash' }))).accountId).toBe(DEFAULT_CASH_ACCOUNT_ID);
    expect((await repos.transactions.insert(tx({ paymentMethod: 'upi' }))).accountId).toBe(DEFAULT_BANK_ACCOUNT_ID);
  });

  it('tracks balances from opening balance and every entry type', async () => {
    const { repos } = await createTestContext();
    const wallet = await repos.accounts.add({ name: 'Paytm wallet', type: 'wallet', openingBalancePaise: 10_000 });
    await repos.transactions.insert(tx({ accountId: wallet.id, amountPaise: 3_000 }));
    await repos.transactions.insert(tx({ accountId: wallet.id, type: 'refund', amountPaise: 1_000 }));
    await repos.transactions.insert(tx({ accountId: wallet.id, type: 'income', categoryKey: 'income', amountPaise: 500 }));
    const balance = (await repos.accounts.list()).find((a) => a.id === wallet.id)!.balancePaise;
    expect(balance).toBe(10_000 - 3_000 + 1_000 + 500);
  });

  it('moves money between accounts without changing spending, income or the total', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ type: 'income', categoryKey: 'income', amountPaise: 100_000, occurredAt: at(16) }));
    const t = await repos.transactions.createTransfer({
      fromAccountId: DEFAULT_BANK_ACCOUNT_ID,
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountPaise: 20_000,
      occurredAt: at(17),
    });
    expect(t.out).toMatchObject({ type: 'transfer', transferRole: 'out', accountId: DEFAULT_BANK_ACCOUNT_ID, payeeName: 'To Cash' });
    expect(t.in).toMatchObject({ type: 'transfer', transferRole: 'in', accountId: DEFAULT_CASH_ACCOUNT_ID, payeeName: 'From Bank & UPI' });

    const accounts = await repos.accounts.list();
    expect(accounts.find((a) => a.id === DEFAULT_BANK_ACCOUNT_ID)!.balancePaise).toBe(80_000);
    expect(accounts.find((a) => a.id === DEFAULT_CASH_ACCOUNT_ID)!.balancePaise).toBe(20_000);
    expect((await repos.transactions.summarize()).netPaise).toBe(100_000);

    const week = await repos.analytics.insights('week', JUNE_17);
    expect(week).toMatchObject({ expensePaise: 0, incomePaise: 100_000 });
    expect(week.categories).toEqual([]);
  });

  it('rejects invalid transfers and the transfer category on normal entries', async () => {
    const { repos } = await createTestContext();
    await expect(
      repos.transactions.createTransfer({ fromAccountId: DEFAULT_BANK_ACCOUNT_ID, toAccountId: DEFAULT_BANK_ACCOUNT_ID, amountPaise: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repos.transactions.createTransfer({ fromAccountId: DEFAULT_BANK_ACCOUNT_ID, toAccountId: 'missing', amountPaise: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.transactions.insert(tx({ categoryKey: 'transfer' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.transactions.insert(tx({ accountId: 'missing' }))).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.transactions.count()).toBe(0);
  });

  it('deletes and restores both legs of a transfer together, and refuses to edit a leg', async () => {
    const { repos } = await createTestContext();
    const t = await repos.transactions.createTransfer({
      fromAccountId: DEFAULT_BANK_ACCOUNT_ID,
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountPaise: 5_000,
    });
    await expect(repos.transactions.update(t.out.id, { amountPaise: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.transactions.remove(t.in.id)).toBe(true);
    expect(await repos.transactions.count()).toBe(0);
    expect(await repos.transactions.restore(t.out.id)).toBe(true);
    expect(await repos.transactions.count()).toBe(2);
  });

  it('archives accounts but never the last active one, and blocks new entries on archived accounts', async () => {
    const { repos } = await createTestContext();
    expect(await repos.accounts.archive(DEFAULT_CASH_ACCOUNT_ID)).toBe(true);
    await expect(repos.accounts.archive(DEFAULT_BANK_ACCOUNT_ID)).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.transactions.insert(tx({ paymentMethod: 'cash' }))).rejects.toBeInstanceOf(ValidationError);
    expect((await repos.accounts.list()).map((a) => a.id)).toEqual([DEFAULT_BANK_ACCOUNT_ID]);
    expect((await repos.accounts.list(true))).toHaveLength(2);
  });
});

describe('refunds', () => {
  it('reduce spending in their category and never count as income', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ amountPaise: 30_000, categoryKey: 'food', occurredAt: at(15) }));
    await repos.transactions.insert(tx({ type: 'refund', amountPaise: 10_000, categoryKey: 'food', occurredAt: at(16) }));
    const week = await repos.analytics.insights('week', JUNE_17);
    expect(week).toMatchObject({ expensePaise: 20_000, incomePaise: 0 });
    expect(week.categories).toEqual([{ categoryKey: 'food', amountPaise: 20_000, percent: 100, count: 1 }]);
    const { dayBuckets } = await import('@spentsmart/finance/periods');
    expect((await repos.analytics.bucketTotals(dayBuckets(3, JUNE_17))).map((b) => b.amountPaise)).toEqual([30_000, -10_000, 0]);
  });

  it('a fully refunded category disappears from the breakdown', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ amountPaise: 5_000, categoryKey: 'rent', occurredAt: at(15) }));
    await repos.transactions.insert(tx({ type: 'refund', amountPaise: 5_000, categoryKey: 'rent', occurredAt: at(16) }));
    expect((await repos.analytics.insights('week', JUNE_17)).categories).toEqual([]);
  });
});

describe('soft delete, versions, revisions and tags', () => {
  it('hides deleted rows everywhere, and undo brings them back', async () => {
    const { repos } = await createTestContext();
    const t = await repos.transactions.insert(tx({ occurredAt: at(16) }));
    await repos.transactions.remove(t.id);
    expect(await repos.transactions.getById(t.id)).toBeNull();
    expect((await repos.transactions.list()).items).toHaveLength(0);
    expect((await repos.analytics.insights('week', JUNE_17)).expensePaise).toBe(0);
    expect((await repos.storageStats()).transactions).toBe(0);
    expect(await repos.transactions.remove(t.id)).toBe(false);
    expect(await repos.transactions.restore(t.id)).toBe(true);
    expect((await repos.analytics.insights('week', JUNE_17)).expensePaise).toBe(10_000);
  });

  it('keeps every previous state and bumps the version on each edit', async () => {
    const { repos } = await createTestContext();
    const t = await repos.transactions.insert(tx({ amountPaise: 100 }));
    await repos.transactions.update(t.id, { amountPaise: 200 });
    await repos.transactions.update(t.id, { note: 'fixed typo' });
    const now = await repos.transactions.getById(t.id);
    expect(now).toMatchObject({ amountPaise: 200, note: 'fixed typo', version: 3 });
    const history = await repos.transactions.revisions(t.id);
    expect(history.map((r) => [r.version, r.snapshot.amountPaise, r.snapshot.note])).toEqual([
      [1, 100, null],
      [2, 200, null],
    ]);
  });

  it('filters by account and by an inclusive amount range', async () => {
    const { repos } = await createTestContext();
    const small = await repos.transactions.insert(tx({ amountPaise: 5_000, paymentMethod: 'cash' }));
    const mid = await repos.transactions.insert(tx({ amountPaise: 10_000 }));
    const big = await repos.transactions.insert(tx({ amountPaise: 50_000 }));
    const ids = async (filter: Parameters<typeof repos.transactions.list>[0]) =>
      (await repos.transactions.list(filter)).items.map((x) => x.id).sort();

    expect(await ids({ accountId: DEFAULT_CASH_ACCOUNT_ID })).toEqual([small.id]);
    expect(await ids({ minPaise: 10_000 })).toEqual([mid.id, big.id].sort());
    expect(await ids({ maxPaise: 10_000 })).toEqual([small.id, mid.id].sort());
    expect(await ids({ minPaise: 10_000, maxPaise: 10_000 })).toEqual([mid.id]);
    expect(await ids({ minPaise: 60_000 })).toEqual([]);
    expect(await repos.transactions.summarize({ minPaise: 10_000, accountId: DEFAULT_BANK_ACCOUNT_ID })).toMatchObject({ count: 2 });
  });

  it('stores normalised, de-duplicated tags and can filter and search by them', async () => {
    const { repos } = await createTestContext();
    const t = await repos.transactions.insert(tx({ tags: ['Goa Trip', 'goa-trip', '  work  '] }));
    expect(t.tags).toEqual(['goa-trip', 'work']);
    await repos.transactions.insert(tx({ payeeName: 'Other' }));
    expect((await repos.transactions.list({ tag: 'goa-trip' })).items.map((x) => x.id)).toEqual([t.id]);
    expect((await repos.transactions.list({ search: 'goa' })).items.map((x) => x.id)).toEqual([t.id]);
    await repos.transactions.update(t.id, { tags: [] });
    expect((await repos.transactions.getById(t.id))!.tags).toEqual([]);
    await expect(repos.transactions.insert(tx({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('lists tags on live transactions, most used first', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ tags: ['work', 'goa'] }));
    await repos.transactions.insert(tx({ tags: ['goa'] }));
    const gone = await repos.transactions.insert(tx({ tags: ['old'] }));
    await repos.transactions.remove(gone.id);
    expect(await repos.transactions.tags()).toEqual(['goa', 'work']);
  });

  it('records payments made through the scanner with source "scan", once', async () => {
    const { repos } = await createTestContext();
    const a = await repos.attempts.create({ vpa: 'a.b@ybl', payeeName: 'Shop', amountPaise: 100, note: null, categoryKey: 'food', appPackage: null, txnRef: null });
    const t1 = await repos.attempts.record(a.id);
    const t2 = await repos.attempts.record(a.id);
    expect(t1).toMatchObject({ source: 'scan', accountId: DEFAULT_BANK_ACCOUNT_ID });
    expect(t2!.id).toBe(t1!.id);
  });
});

describe('budgets and goals', () => {
  it('reports overall and category budgets for the month, with refunds and transfers handled', async () => {
    const { repos, clock } = await createTestContext();
    clock.now = JUNE_17.getTime();
    await repos.budgets.set(null, 50_000);
    await repos.budgets.set('food', 10_000);
    await repos.transactions.insert(tx({ amountPaise: 12_000, categoryKey: 'food', occurredAt: at(5) }));
    await repos.transactions.insert(tx({ type: 'refund', amountPaise: 1_000, categoryKey: 'food', occurredAt: at(6) }));
    await repos.transactions.insert(tx({ amountPaise: 8_000, categoryKey: 'rent', occurredAt: at(7) }));
    await repos.transactions.createTransfer({ fromAccountId: DEFAULT_BANK_ACCOUNT_ID, toAccountId: DEFAULT_CASH_ACCOUNT_ID, amountPaise: 30_000, occurredAt: at(8) });

    const statuses = await repos.budgets.statuses(JUNE_17);
    const overall = statuses.find((b) => b.categoryKey === null)!.status;
    const food = statuses.find((b) => b.categoryKey === 'food')!.status;
    expect(overall).toMatchObject({ spentPaise: 19_000, availablePaise: 50_000, remainingPaise: 31_000, over: false });
    expect(food).toMatchObject({ spentPaise: 11_000, remainingPaise: -1_000, over: true, percent: 110 });
  });

  it('carries unused budget into the next month when rollover is on', async () => {
    const { repos } = await createTestContext();
    await repos.budgets.set('food', 10_000, true);
    await repos.transactions.insert(tx({ amountPaise: 4_000, categoryKey: 'food', occurredAt: at(20, 4) }));
    const [food] = await repos.budgets.statuses(JUNE_17);
    expect(food!.status).toMatchObject({ carriedPaise: 6_000, availablePaise: 16_000 });
  });

  it('replaces the active budget for a category instead of stacking budgets', async () => {
    const { repos } = await createTestContext();
    await repos.budgets.set('food', 10_000);
    await repos.budgets.set('food', 20_000);
    expect((await repos.budgets.listActive()).map((b) => b.limitPaise)).toEqual([20_000]);
    expect(await repos.budgets.remove('food')).toBe(true);
    expect(await repos.budgets.listActive()).toEqual([]);
    await expect(repos.budgets.set('food', 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.budgets.set('transfer', 100)).rejects.toBeInstanceOf(ValidationError);
  });

  it('tracks savings goals and never lets saved money go negative', async () => {
    const { repos } = await createTestContext();
    const goal = await repos.goals.add({ name: 'Goa trip', targetPaise: 2_000_000, deadline: at(30, 11) });
    expect((await repos.goals.contribute(goal.id, 500_000))!.savedPaise).toBe(500_000);
    expect((await repos.goals.contribute(goal.id, -900_000))!.savedPaise).toBe(0);
    await expect(repos.goals.add({ name: '', targetPaise: 100 })).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.goals.archive(goal.id)).toBe(true);
    expect(await repos.goals.list()).toEqual([]);
  });
});

describe('erase everything (v2)', () => {
  it('also clears accounts, budgets, goals, tags and revisions', async () => {
    const { repos, raw } = await createTestContext();
    const wallet = await repos.accounts.add({ name: 'Wallet', type: 'wallet' });
    const t = await repos.transactions.insert(tx({ accountId: wallet.id, tags: ['x'] }));
    await repos.transactions.update(t.id, { amountPaise: 5 });
    await repos.budgets.set(null, 100);
    await repos.goals.add({ name: 'Bike', targetPaise: 100 });
    await repos.eraseEverything();
    for (const table of ['transactions', 'transaction_tags', 'transaction_revisions', 'budgets', 'goals']) {
      expect(raw.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()).toEqual({ c: 0 });
    }
    expect((await repos.accounts.list(true)).map((a) => a.id)).toEqual([DEFAULT_BANK_ACCOUNT_ID, DEFAULT_CASH_ACCOUNT_ID]);
  });
});
