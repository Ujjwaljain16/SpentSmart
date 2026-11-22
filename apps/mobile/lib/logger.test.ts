import { describe, expect, it } from 'vitest';
import { clearLogs, getRecentLogs, log, redact } from './logger';

describe('redact', () => {
  it('removes UPI IDs, amounts and identifying params', () => {
    expect(redact('paying friend.name@okaxis')).toBe('paying ***@***');
    expect(redact('upi://pay?pa=a@b.c&pn=Raj&am=500.00&tn=rent&sign=XYZ==')).toBe(
      'upi://pay?pa=***&pn=***&am=***&tn=***&sign=***',
    );
  });

  it('leaves unrelated text alone', () => {
    expect(redact('Database opened in 12ms')).toBe('Database opened in 12ms');
  });
});

describe('log ring buffer', () => {
  it('keeps redacted warnings/errors, bounded to 100 entries', () => {
    clearLogs();
    for (let i = 0; i < 120; i++) log.warn(`attempt ${i} for a@b.com`);
    const logs = getRecentLogs();
    expect(logs).toHaveLength(100);
    expect(logs[0]!.message).toBe('attempt 20 for ***@***');
    clearLogs();
    expect(getRecentLogs()).toHaveLength(0);
  });
});
