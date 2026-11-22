import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InvalidRecoveryKeyError,
  WrongKeyError,
  decryptRecord,
  encryptRecord,
  formatRecoveryKey,
  generateKey,
  parseRecoveryKey,
  unwrapDataKey,
  wrapDataKey,
} from './crypto';
import { fromBase32, fromBase64, toBase32, toBase64 } from './encoding';

const random = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));
const addr = { userId: 'u1', collection: 'transactions', recordId: 'r1' };

describe('encoding', () => {
  it('round-trips base64 for every length remainder', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = random(n);
      const text = toBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(fromBase64(text)).toEqual(bytes);
    }
  });

  it('rejects malformed base64', () => {
    expect(() => fromBase64('ab$c')).toThrow();
    expect(() => fromBase64('abcde')).toThrow();
  });

  it('round-trips base32', () => {
    const bytes = random(32);
    expect(fromBase32(toBase32(bytes), 32)).toEqual(bytes);
  });
});

describe('utf8', () => {
  it('matches the platform encoder for ASCII, Hindi, rupee signs and emoji', async () => {
    const { utf8 } = await import('./encoding');
    for (const text of ['Swiggy 340', 'चाय ₹20', '🎉 बोनस', '', 'mixed ₹1,23,456.70 नमस्ते 👍🏽']) {
      expect(utf8.encode(text)).toEqual(new TextEncoder().encode(text));
      expect(utf8.decode(new TextEncoder().encode(text))).toBe(text);
    }
  });
});

describe('recovery key', () => {
  it('formats as 54 characters in groups of four and parses back', () => {
    const key = generateKey(random);
    const text = formatRecoveryKey(key);
    expect(text).toMatch(/^([0-9A-Z]{4}-){13}[0-9A-Z]{2}$/);
    expect(parseRecoveryKey(text)).toEqual(key);
  });

  it('accepts lowercase, spaces and the usual look-alikes', () => {
    const key = generateKey(random);
    const sloppy = formatRecoveryKey(key).toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
    expect(parseRecoveryKey(sloppy)).toEqual(key);
  });

  it('catches a typo before trying it', () => {
    const text = formatRecoveryKey(generateKey(random));
    const i = text.length - 7;
    const typo = text.slice(0, i) + (text[i] === 'A' ? 'B' : 'A') + text.slice(i + 1);
    expect(() => parseRecoveryKey(typo)).toThrow(InvalidRecoveryKeyError);
    expect(() => parseRecoveryKey(text.slice(0, 20))).toThrow(InvalidRecoveryKeyError);
    expect(() => parseRecoveryKey('!!!!')).toThrow(InvalidRecoveryKeyError);
  });
});

describe('data key wrapping', () => {
  it('unwraps with the right recovery key and user', () => {
    const dk = generateKey(random);
    const rk = generateKey(random);
    const wrapped = wrapDataKey(dk, rk, 'u1', random);
    expect(unwrapDataKey(wrapped, rk, 'u1')).toEqual(dk);
  });

  it('refuses a wrong recovery key, another user, or tampering', () => {
    const dk = generateKey(random);
    const rk = generateKey(random);
    const wrapped = wrapDataKey(dk, rk, 'u1', random);
    expect(() => unwrapDataKey(wrapped, generateKey(random), 'u1')).toThrow(WrongKeyError);
    expect(() => unwrapDataKey(wrapped, rk, 'u2')).toThrow(WrongKeyError);
    const bytes = fromBase64(wrapped);
    bytes[30] = bytes[30]! ^ 1;
    expect(() => unwrapDataKey(toBase64(bytes), rk, 'u1')).toThrow(WrongKeyError);
  });
});

describe('records', () => {
  const dk = generateKey(random);
  const value = { amountPaise: 34_000, payeeName: 'Swiggy', tags: ['office'] };

  it('round-trips and uses a fresh nonce every time', () => {
    const a = encryptRecord(dk, addr, value, random);
    const b = encryptRecord(dk, addr, value, random);
    expect(a).not.toBe(b);
    expect(decryptRecord(dk, addr, a)).toEqual(value);
  });

  it('does not leak the plaintext', () => {
    const sealed = encryptRecord(dk, addr, value, random);
    expect(Buffer.from(fromBase64(sealed)).toString('latin1')).not.toContain('Swiggy');
  });

  it('fails when moved to another record, collection or user', () => {
    const sealed = encryptRecord(dk, addr, value, random);
    expect(() => decryptRecord(dk, { ...addr, recordId: 'r2' }, sealed)).toThrow(WrongKeyError);
    expect(() => decryptRecord(dk, { ...addr, collection: 'goals' }, sealed)).toThrow(WrongKeyError);
    expect(() => decryptRecord(dk, { ...addr, userId: 'u2' }, sealed)).toThrow(WrongKeyError);
  });

  it('fails with another key or damaged data', () => {
    const sealed = encryptRecord(dk, addr, value, random);
    expect(() => decryptRecord(generateKey(random), addr, sealed)).toThrow(WrongKeyError);
    expect(() => decryptRecord(dk, addr, 'AAAA')).toThrow(WrongKeyError);
    expect(() => decryptRecord(dk, addr, '%%%')).toThrow(WrongKeyError);
  });
});
