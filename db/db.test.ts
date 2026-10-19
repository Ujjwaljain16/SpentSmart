import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '@/domain/categories';
import { NewTransaction } from '@/domain/types';
import { createNodeDriver, createTestContext } from '@/tests/helpers/node-driver';
import { createSerializedDriver, SqlExecutor } from './driver';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, SchemaTooNewError, migrate } from './migrations';
import { SETTINGS_DEFAULTS } from './repositories/settings';
import { ValidationError } from './repositories/transactions';

const DAY = 24 * 60 * 60 * 1000;

const tx = (over: Partial<NewTransaction> = {}): NewTransaction => ({
  amountPaise: 10_000,
  type: 'expense',
  categoryKey: 'food',
  payeeName: 'Cafe',
  paymentMethod: 'upi',
  verifiedBy: 'manual',
  ...over,
});

describe('driver', () => {
  it('serialises concurrent transactions so they never interleave', async () => {
    const { driver } = createNodeDriver();
    await driver.exec('CREATE TABLE t (n INTEGER)');
    const order: string[] = [];
    const slow = (name: string) =>
      driver.transaction(async (x) => {
        order.push(`${name}:start`);
        await x.run('INSERT INTO t VALUES (1)');
        await new Promise((r) => setTimeout(r, 5));
        order.push(`${name}:end`);
      });
    await Promise.all([slow('a'), slow('b'), slow('c')]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('rolls back everything when a transaction throws, and keeps working afterwards', async () => {
    const { driver } = createNodeDriver();
    await driver.exec('CREATE TABLE t (n INTEGER)');
    await expect(
      driver.transaction(async (x) => {
        await x.run('INSERT INTO t VALUES (1)');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await driver.first<{ c: number }>('SELECT COUNT(*) AS c FROM t'))!.c).toBe(0);
    await driver.run('INSERT INTO t VALUES (2)');
    expect((await driver.first<{ c: number }>('SELECT COUNT(*) AS c FROM t'))!.c).toBe(1);
  });

  it('keeps the queue alive after a failing top-level statement', async () => {
    const failing: SqlExecutor = {
      run: async () => {
        throw new Error('nope');
      },
      all: async () => [],
      first: async () => null,
      exec: async () => undefined,
    };
    const d = createSerializedDriver(failing);
    await expect(d.run('x')).rejects.toThrow('nope');
    await expect(d.all('x')).resolves.toEqual([]);
  });
});

describe('migrations', () => {
  it('creates the schema, seeds categories and records the version', async () => {
    const { driver } = createNodeDriver();
    expect(await migrate(driver)).toBe(LATEST_SCHEMA_VERSION);
    const cats = await driver.all('SELECT key FROM categories ORDER BY sort_order');
    expect(cats.map((c) => c.key)).toEqual(DEFAULT_CATEGORIES.map((c) => c.key));
    expect((await driver.first<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(LATEST_SCHEMA_VERSION);
  });

  it('is idempotent', async () => {
    const { driver } = createNodeDriver();
    await migrate(driver);
    await migrate(driver);
    expect((await driver.first<{ c: number }>('SELECT COUNT(*) AS c FROM categories'))!.c).toBe(DEFAULT_CATEGORIES.length);
  });

  it('refuses to open a database from a newer app version', async () => {
    const { driver } = createNodeDriver();
    await driver.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 5}`);
    await expect(migrate(driver)).rejects.toBeInstanceOf(SchemaTooNewError);
  });

  it('applies later migrations on top and rolls back a failing one without bumping the version', async () => {
    const { driver } = createNodeDriver();
    await migrate(driver);
    const v2 = {
      version: LATEST_SCHEMA_VERSION + 1,
      up: async (t: SqlExecutor) => {
        await t.exec('CREATE TABLE extra (n INTEGER)');
        throw new Error('migration failed');
      },
    };
    await expect(migrate(driver, [...MIGRATIONS, v2])).rejects.toThrow('migration failed');
    expect((await driver.first<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(LATEST_SCHEMA_VERSION);
    expect(await driver.first("SELECT name FROM sqlite_master WHERE name = 'extra'")).toBeNull();
  });
});

describe('transactions repo', () => {
  it('inserts, reads, updates and deletes', async () => {
    const { repos } = await createTestContext();
    const created = await repos.transactions.insert(tx({ amountPaise: 12_345, note: '  chai ' }));
    expect(created).toMatchObject({ amountPaise: 12_345, note: 'chai', categoryKey: 'food' });

    expect(await repos.transactions.update(created.id, { amountPaise: 500, categoryKey: 'rent' })).toBe(true);
    expect(await repos.transactions.getById(created.id)).toMatchObject({ amountPaise: 500, categoryKey: 'rent' });

    expect(await repos.transactions.remove(created.id)).toBe(true);
    expect(await repos.transactions.getById(created.id)).toBeNull();
    expect(await repos.transactions.remove(created.id)).toBe(false);
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['fractional', 1.5],
    ['NaN', NaN],
    ['too large', 10_000_000_01 * 100],
  ])('rejects %s amounts', async (_name, amountPaise) => {
    const { repos } = await createTestContext();
    await expect(repos.transactions.insert(tx({ amountPaise }))).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.transactions.insert(tx())).resolves.toBeDefined();
    await expect(repos.transactions.update((await repos.transactions.list()).items[0]!.id, { amountPaise })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('enforces the same rules in the database itself', async () => {
    const { raw } = await createTestContext();
    expect(() =>
      raw
        .prepare(
          `INSERT INTO transactions (id, amount_paise, type, category_key, payee_name, payment_method, occurred_at, created_at, verified_by)
           VALUES ('x', -1, 'expense', 'food', 'n', 'upi', 1, 1, 'manual')`,
        )
        .run(),
    ).toThrow();
  });

  it('is idempotent per attempt id (no duplicate records)', async () => {
    const { repos } = await createTestContext();
    const a = await repos.transactions.insert(tx({ attemptId: 'attempt-1' }));
    const b = await repos.transactions.insert(tx({ attemptId: 'attempt-1', amountPaise: 99 }));
    expect(b.id).toBe(a.id);
    expect(await repos.transactions.count()).toBe(1);
  });

  it('paginates newest first without gaps or duplicates, even with equal timestamps', async () => {
    const { repos } = await createTestContext();
    for (let i = 0; i < 25; i++) {
      await repos.transactions.insert(tx({ occurredAt: 1_000_000 + Math.floor(i / 5) * 1000, payeeName: `P${i}` }));
    }
    const seen: string[] = [];
    let cursor = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof repos.transactions.list>> = await repos.transactions.list({}, 10, cursor);
      seen.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(25);
  });

  it('filters by search (escaping LIKE wildcards), category, type and dates', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ payeeName: '100% Juice', occurredAt: 1000 }));
    await repos.transactions.insert(tx({ payeeName: 'Other Shop', note: 'milk_tea', occurredAt: 2000, categoryKey: 'rent' }));
    await repos.transactions.insert(tx({ payeeName: 'Employer', type: 'income', categoryKey: 'income', occurredAt: 3000 }));

    expect((await repos.transactions.list({ search: '%' })).items.map((t) => t.payeeName)).toEqual(['100% Juice']);
    expect((await repos.transactions.list({ search: 'milk_' })).items).toHaveLength(1);
    expect((await repos.transactions.list({ search: 'MILK' })).items).toHaveLength(1);
    expect((await repos.transactions.list({ categoryKey: 'rent' })).items).toHaveLength(1);
    expect((await repos.transactions.list({ type: 'income' })).items).toHaveLength(1);
    expect((await repos.transactions.list({ since: 2000, until: 3000 })).items.map((t) => t.occurredAt)).toEqual([2000]);
    expect((await repos.transactions.list({ search: "'; DROP TABLE transactions;--" })).items).toHaveLength(0);
    expect(await repos.transactions.count()).toBe(3);
  });

  it('summarises a filter as exact integer net paise', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ amountPaise: 10 }));
    await repos.transactions.insert(tx({ amountPaise: 20 }));
    await repos.transactions.insert(tx({ amountPaise: 100, type: 'income', categoryKey: 'income' }));
    expect(await repos.transactions.summarize()).toEqual({ count: 3, netPaise: 70 });
    expect(await repos.transactions.summarize({ search: 'nothing-matches' })).toEqual({ count: 0, netPaise: 0 });
  });

  it('notifies listeners after writes', async () => {
    const { repos, notifications } = await createTestContext();
    const before = notifications.count;
    await repos.transactions.insert(tx());
    expect(notifications.count).toBeGreaterThan(before);
  });
});

describe('categories repo', () => {
  it('adds categories with unique keys and validates labels', async () => {
    const { repos } = await createTestContext();
    const a = await repos.categories.add({ label: 'Eating Out', icon: 'pizza', color: '#fff' });
    expect(a.key).toBe('eating-out');
    await expect(repos.categories.add({ label: 'eating out', icon: 'pizza', color: '#fff' })).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.categories.add({ label: 'x', icon: 'pizza', color: '#fff' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('moves transactions to "other" when a category is deleted, atomically', async () => {
    const { repos } = await createTestContext();
    const c = await repos.categories.add({ label: 'Travel', icon: 'airplane', color: '#000' });
    const t = await repos.transactions.insert(tx({ categoryKey: c.key }));
    expect(await repos.categories.remove(c.key)).toBe(true);
    expect((await repos.transactions.getById(t.id))!.categoryKey).toBe('other');
    expect((await repos.categories.list()).some((x) => x.key === c.key)).toBe(false);
  });

  it('refuses to delete system categories', async () => {
    const { repos } = await createTestContext();
    expect(await repos.categories.remove('other')).toBe(false);
    expect(await repos.categories.remove('income')).toBe(false);
    expect(await repos.categories.remove('nope')).toBe(false);
  });

  it('resets to defaults without orphaning transactions', async () => {
    const { repos } = await createTestContext();
    const c = await repos.categories.add({ label: 'Travel', icon: 'airplane', color: '#000' });
    await repos.categories.update('food', { label: 'Meals' });
    const t = await repos.transactions.insert(tx({ categoryKey: c.key }));
    await repos.categories.resetToDefaults();
    const list = await repos.categories.list();
    expect(list.map((x) => x.key)).toEqual(DEFAULT_CATEGORIES.map((x) => x.key));
    expect(list.find((x) => x.key === 'food')!.label).toBe('Food');
    expect((await repos.transactions.getById(t.id))!.categoryKey).toBe('other');
  });
});

describe('payment attempts', () => {
  const attempt = {
    vpa: 'friend@okaxis',
    payeeName: 'Friend',
    amountPaise: 25_000,
    note: 'dinner',
    categoryKey: 'food',
    appPackage: 'com.phonepe.app',
    txnRef: 'SS123',
  };

  it('survives a restart: an attempt created before leaving the app is still open afterwards', async () => {
    const { repos } = await createTestContext();
    const a = await repos.attempts.create(attempt);
    expect((await repos.attempts.listOpen()).map((x) => x.id)).toEqual([a.id]);
  });

  it('records into exactly one transaction, even if confirmed twice', async () => {
    const { repos } = await createTestContext();
    const a = await repos.attempts.create(attempt);
    await repos.attempts.markReturned(a.id, { suggestion: 'paid', response: 'Status=SUCCESS&txnId=T1' });
    const first = await repos.attempts.record(a.id, {}, 'upi_result', { id: 'T1' });
    const second = await repos.attempts.record(a.id, {}, 'upi_result', { id: 'T1' });
    expect(second!.id).toBe(first!.id);
    expect(await repos.transactions.count()).toBe(1);
    expect(first).toMatchObject({ amountPaise: 25_000, payeeVpa: 'friend@okaxis', verifiedBy: 'upi_result', upiTxnId: 'T1', upiTxnRef: 'SS123' });
    expect((await repos.attempts.get(a.id))!.status).toBe('recorded');
    expect(await repos.attempts.listOpen()).toHaveLength(0);
  });

  it('lets the user override the amount and category when recording', async () => {
    const { repos } = await createTestContext();
    const a = await repos.attempts.create(attempt);
    const t = await repos.attempts.record(a.id, { amountPaise: 30_000, categoryKey: 'rent' });
    expect(t).toMatchObject({ amountPaise: 30_000, categoryKey: 'rent' });
  });

  it('cannot record an attempt that has no amount unless one is supplied', async () => {
    const { repos } = await createTestContext();
    const a = await repos.attempts.create({ ...attempt, amountPaise: null });
    expect(await repos.attempts.record(a.id)).toBeNull();
    expect(await repos.attempts.record(a.id, { amountPaise: 100 })).not.toBeNull();
  });

  it('regression: "Decide later" really hides an attempt for a while, then it returns', async () => {
    const { repos, clock } = await createTestContext();
    const a = await repos.attempts.create(attempt);
    await repos.attempts.snooze(a.id, 60 * 60 * 1000);
    expect(await repos.attempts.listOpen()).toHaveLength(0);
    clock.now += 61 * 60 * 1000;
    expect((await repos.attempts.listOpen()).map((x) => x.id)).toEqual([a.id]);
  });

  it('discarded attempts never come back', async () => {
    const { repos } = await createTestContext();
    const a = await repos.attempts.create(attempt);
    await repos.attempts.discard(a.id);
    expect(await repos.attempts.listOpen()).toHaveLength(0);
    expect(await repos.attempts.record(a.id)).toMatchObject({ amountPaise: 25_000 }); // explicit record still possible
  });

  it('expires stale attempts and purges old history on cleanup', async () => {
    const { repos, clock, raw } = await createTestContext();
    const a = await repos.attempts.create(attempt);
    clock.now += 25 * 60 * 60 * 1000;
    expect(await repos.attempts.listOpen()).toHaveLength(0);
    await repos.attempts.cleanup();
    expect((await repos.attempts.get(a.id))!.status).toBe('expired');
    clock.now += 31 * 24 * 60 * 60 * 1000;
    await repos.attempts.cleanup();
    expect(raw.prepare('SELECT COUNT(*) AS c FROM payment_attempts').get()).toEqual({ c: 0 });
  });

  it('does not let a late result resurrect a closed attempt', async () => {
    const { repos } = await createTestContext();
    const a = await repos.attempts.create(attempt);
    await repos.attempts.discard(a.id);
    await repos.attempts.markReturned(a.id, { suggestion: 'paid', response: null });
    expect((await repos.attempts.get(a.id))!.status).toBe('discarded');
  });
});

describe('settings repo', () => {
  it('returns typed defaults and round-trips values', async () => {
    const { repos } = await createTestContext();
    expect(await repos.settings.loadAll()).toEqual(SETTINGS_DEFAULTS);
    await repos.settings.set('bioLockEnabled', true);
    await repos.settings.set('budgetPaise', 1_500_000);
    await repos.settings.set('themeMode', 'dark');
    await repos.settings.set('profileName', 'Asha');
    expect(await repos.settings.loadAll()).toMatchObject({
      bioLockEnabled: true,
      budgetPaise: 1_500_000,
      themeMode: 'dark',
      profileName: 'Asha',
    });
    await repos.settings.set('bioLockEnabled', false);
    expect((await repos.settings.loadAll()).bioLockEnabled).toBe(false);
  });

  it('ignores corrupt stored values instead of crashing', async () => {
    const { repos, raw } = await createTestContext();
    raw.prepare("INSERT INTO settings (key, value) VALUES ('themeMode', 'neon'), ('budgetPaise', 'abc')").run();
    const s = await repos.settings.loadAll();
    expect(s.themeMode).toBe('system');
    expect(s.budgetPaise).toBe(0);
  });
});

describe('analytics repo', () => {
  const NOW = new Date(2026, 5, 17, 12, 0); // Wed 17 Jun 2026
  const at = (d: number, mo = 5, y = 2026) => new Date(y, mo, d, 10, 0).getTime();

  it('computes insights for a week with trend, categories and payees', async () => {
    const { repos } = await createTestContext();
    // this week: Mon 15 .. Sun 21
    await repos.transactions.insert(tx({ amountPaise: 30_000, occurredAt: at(15), payeeName: 'Cafe', categoryKey: 'food' }));
    await repos.transactions.insert(tx({ amountPaise: 10_000, occurredAt: at(16), payeeName: 'cafe', categoryKey: 'food' }));
    await repos.transactions.insert(tx({ amountPaise: 20_000, occurredAt: at(17), payeeName: 'Landlord', categoryKey: 'rent' }));
    await repos.transactions.insert(tx({ amountPaise: 50_000, type: 'income', categoryKey: 'income', occurredAt: at(17), payeeName: 'Employer' }));
    // previous week: Mon 8 .. Sun 14
    await repos.transactions.insert(tx({ amountPaise: 30_000, occurredAt: at(10) }));
    // outside both
    await repos.transactions.insert(tx({ amountPaise: 99_999, occurredAt: at(1) }));

    const ins = await repos.analytics.insights('week', NOW);
    expect(ins).toMatchObject({ incomePaise: 50_000, expensePaise: 60_000, balancePaise: -10_000 });
    expect(ins.trend).toEqual({ percent: 100, direction: 'up' });
    expect(ins.categories.map((c) => [c.categoryKey, c.amountPaise, c.percent, c.count])).toEqual([
      ['food', 40_000, 67, 2],
      ['rent', 20_000, 33, 1],
    ]);
    expect(ins.topPayees[0]).toMatchObject({ amountPaise: 40_000, count: 2 });
    expect(ins.topPayees).toHaveLength(2);
  });

  it('regression: a transaction late on Dec 31 counts towards that year', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ amountPaise: 5_000, occurredAt: new Date(2026, 11, 31, 18, 0).getTime() }));
    const ins = await repos.analytics.insights('year', new Date(2026, 6, 1));
    expect(ins.expensePaise).toBe(5_000);
  });

  it('computes bucket totals in one pass', async () => {
    const { repos } = await createTestContext();
    await repos.transactions.insert(tx({ amountPaise: 100, occurredAt: at(17) }));
    await repos.transactions.insert(tx({ amountPaise: 200, occurredAt: at(17) }));
    await repos.transactions.insert(tx({ amountPaise: 400, occurredAt: at(15) }));
    await repos.transactions.insert(tx({ amountPaise: 999, type: 'income', categoryKey: 'income', occurredAt: at(17) }));
    const { dayBuckets } = await import('@/domain/periods');
    const totals = await repos.analytics.bucketTotals(dayBuckets(3, NOW)); // 15, 16, 17
    expect(totals.map((t) => t.amountPaise)).toEqual([400, 0, 300]);
    expect(await repos.analytics.bucketTotals([])).toEqual([]);
  });

  it('compares a category month over month (custom categories included)', async () => {
    const { repos } = await createTestContext();
    const c = await repos.categories.add({ label: 'Travel', icon: 'airplane', color: '#000' });
    await repos.transactions.insert(tx({ categoryKey: c.key, amountPaise: 300, occurredAt: at(2) }));
    await repos.transactions.insert(tx({ categoryKey: c.key, amountPaise: 200, occurredAt: at(20, 4) }));
    const cmp = await repos.analytics.categoryComparison(c.key, NOW);
    expect(cmp).toMatchObject({ currentPaise: 300, previousPaise: 200, trend: { percent: 50, direction: 'up' } });
  });
});

describe('erase everything', () => {
  it('removes data and settings but leaves a usable default state', async () => {
    const { repos } = await createTestContext();
    await repos.categories.add({ label: 'Travel', icon: 'airplane', color: '#000' });
    await repos.transactions.insert(tx());
    await repos.settings.set('profileName', 'Asha');
    const a = await repos.attempts.create({ vpa: 'a@b.c', payeeName: 'x', amountPaise: 1, note: null, categoryKey: 'food', appPackage: null, txnRef: null });

    await repos.eraseEverything();
    expect(await repos.transactions.count()).toBe(0);
    expect(await repos.attempts.get(a.id)).toBeNull();
    expect(await repos.settings.loadAll()).toEqual(SETTINGS_DEFAULTS);
    expect((await repos.categories.list()).map((c) => c.key)).toEqual(DEFAULT_CATEGORIES.map((c) => c.key));
  });
});

describe('scale', () => {
  it('stays fast with 100,000 transactions (paged list, summary, insights)', async () => {
    const { driver, repos } = await createTestContext();
    const base = new Date(2026, 5, 17, 12).getTime();
    await driver.transaction(async (x) => {
      const cats = ['food', 'utility', 'college', 'rent', 'other'];
      for (let i = 0; i < 100_000; i++) {
        await x.run(
          `INSERT INTO transactions (id, amount_paise, type, category_key, payee_name, payee_vpa, payment_method, note, occurred_at, created_at, verified_by)
           VALUES (?, ?, 'expense', ?, ?, ?, 'upi', 'bulk', ?, ?, 'manual')`,
          [`id-${i}`, 100 + (i % 5000), cats[i % 5]!, `Merchant ${i % 400}`, `m${i % 400}@ybl`, base - i * 600_000, base],
        );
      }
    });
    expect(await repos.transactions.count()).toBe(100_000);

    const time = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };
    const page = await time(() => repos.transactions.list({}, 50));
    const deep = await time(() => repos.transactions.list({}, 50, { occurredAt: base - 50_000 * 600_000, id: 'id-50000' }));
    const search = await time(() => repos.transactions.list({ search: 'merchant 399' }, 50));
    const summary = await time(() => repos.transactions.summarize({ categoryKey: 'food' }));
    const insights = await time(() => repos.analytics.insights('year', new Date(base)));
    // Generous ceilings (CI machines vary); typical local numbers are single-digit milliseconds.
    expect(page).toBeLessThan(100);
    expect(deep).toBeLessThan(100);
    expect(search).toBeLessThan(1500);
    expect(summary).toBeLessThan(500);
    expect(insights).toBeLessThan(1500);
    console.info(
      `[scale] 100k rows: first page ${page.toFixed(1)}ms, deep page ${deep.toFixed(1)}ms, search ${search.toFixed(1)}ms, ` +
        `summary ${summary.toFixed(1)}ms, year insights ${insights.toFixed(1)}ms`,
    );
  }, 120_000);
});

void DAY;

describe('storage stats', () => {
  it('reports counts, range and a non-zero size', async () => {
    const { repos } = await createTestContext();
    expect((await repos.storageStats()).transactions).toBe(0);
    await repos.transactions.insert(tx({ occurredAt: 1000 }));
    await repos.transactions.insert(tx({ occurredAt: 5000 }));
    const stats = await repos.storageStats();
    expect(stats).toMatchObject({ transactions: 2, oldest: 1000, newest: 5000, categories: DEFAULT_CATEGORIES.length });
    expect(stats.bytes).toBeGreaterThan(0);
  });
});
