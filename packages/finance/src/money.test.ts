import { describe, expect, it } from 'vitest';
import {
  MAX_PAISE,
  formatPaise,
  groupIndian,
  isValidPaise,
  paiseToDecimal,
  parseRupees,
  percentOf,
} from './money';

describe('parseRupees', () => {
  it.each([
    ['1', 100],
    ['1.5', 150],
    ['1.50', 150],
    ['0.05', 5],
    ['.5', 50],
    ['₹ 1,250.75', 125075],
    ['100000', 10_000_000],
    ['1.', 100],
  ])('parses %s -> %d paise', (input, expected) => {
    expect(parseRupees(input)).toBe(expected);
  });

  it.each([
    '', ' ', '0', '0.00', '-50', '+5', '1e9', '12abc', 'abc', '1.234', '1..2', '١٢٣',
    '99999999999', '10000000.01',
  ])('rejects %j', (input) => {
    expect(parseRupees(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseRupees(undefined)).toBeNull();
    expect(parseRupees(null)).toBeNull();
  });

  it('accepts exactly the maximum and nothing above', () => {
    expect(parseRupees('10000000')).toBe(MAX_PAISE);
    expect(parseRupees('10000000.01')).toBeNull();
  });

  it('is exact where floats are not', () => {
    // 0.1 * 10 in floating point is 0.9999999999999999
    let paise = 0;
    for (let i = 0; i < 10; i++) paise += parseRupees('0.1')!;
    expect(paise).toBe(100);
    expect(parseRupees('1.005')).toBeNull(); // never silently rounds
  });
});

describe('isValidPaise', () => {
  it('requires positive safe integers within the cap', () => {
    expect(isValidPaise(1)).toBe(true);
    expect(isValidPaise(0)).toBe(false);
    expect(isValidPaise(-1)).toBe(false);
    expect(isValidPaise(1.5)).toBe(false);
    expect(isValidPaise(NaN)).toBe(false);
    expect(isValidPaise(MAX_PAISE + 1)).toBe(false);
    expect(isValidPaise('5' as unknown)).toBe(false);
  });
});

describe('formatting', () => {
  it('groups digits the Indian way', () => {
    expect(groupIndian('1')).toBe('1');
    expect(groupIndian('999')).toBe('999');
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('100000')).toBe('1,00,000');
    expect(groupIndian('12345678')).toBe('1,23,45,678');
  });

  it('formats paise', () => {
    expect(formatPaise(0)).toBe('₹0');
    expect(formatPaise(5)).toBe('₹0.05');
    expect(formatPaise(150)).toBe('₹1.50');
    expect(formatPaise(100)).toBe('₹1');
    expect(formatPaise(100, { alwaysDecimals: true })).toBe('₹1.00');
    expect(formatPaise(12345678, { symbol: false })).toBe('1,23,456.78');
    expect(formatPaise(-250)).toBe('-₹2.50');
  });

  it('renders decimals for URIs', () => {
    expect(paiseToDecimal(125050)).toBe('1250.50');
    expect(paiseToDecimal(5)).toBe('0.05');
    expect(paiseToDecimal(100)).toBe('1.00');
  });

  it('computes safe percentages', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(5, 0)).toBe(0);
  });
});
