import { describe, expect, it } from 'vitest';
import { createCrashLog, installCrashHandler } from './crash-log';
import { redact } from './logger';

const memory = () => {
  let text: string | null = null;
  return { read: () => text, write: (t: string) => void (text = t), raw: () => text };
};

describe('crash log', () => {
  it('keeps crashes across restarts, newest last, at most 20', () => {
    const store = memory();
    let t = 0;
    const log = createCrashLog(store, () => ++t);
    for (let i = 0; i < 25; i++) log.record(new Error(`boom ${i}`), i % 2 === 0);
    const reopened = createCrashLog(store);
    const records = reopened.list();
    expect(records).toHaveLength(20);
    expect(records[0]!.message).toMatch(/^Error: boom 5/);
    expect(records[19]).toMatchObject({ fatal: true, at: 25 });
  });

  it('never stores UPI IDs, amounts or emails', () => {
    const store = memory();
    // A plain message (no stack trace, whose file positions are numbers too).
    createCrashLog(store, () => 1).record('pay to rahul@okaxis of ₹1,250.50 failed for asha@gmail.com am=340&pa=x@ybl', true);
    const raw = store.raw()!;
    for (const secret of ['rahul@okaxis', '1,250.50', 'asha@gmail.com', '340', 'x@ybl']) expect(raw).not.toContain(secret);
  });

  it('survives a corrupt or failing store', () => {
    const bad = { read: () => '{not json', write: () => { throw new Error('disk full'); } };
    const log = createCrashLog(bad);
    expect(log.list()).toEqual([]);
    expect(() => log.record(new Error('x'), true)).not.toThrow();
  });

  it('records uncaught errors and still hands them to the previous handler', () => {
    const store = memory();
    const log = createCrashLog(store);
    const seen: unknown[] = [];
    let handler: (e: unknown, fatal?: boolean) => void = (e) => void seen.push(e);
    installCrashHandler(log, { getGlobalHandler: () => handler, setGlobalHandler: (h) => void (handler = h) });
    const err = new TypeError('undefined is not a function');
    handler(err, true);
    expect(seen).toEqual([err]);
    expect(log.list()[0]).toMatchObject({ fatal: true, message: expect.stringContaining('TypeError: undefined is not a function') });
  });

  it('redact also covers rupee amounts and emails', () => {
    expect(redact('₹340 and Rs. 1,200 for a@b.co')).toBe('₹*** and Rs. *** for ***@***');
  });
});
