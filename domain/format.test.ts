import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [-5, '0 B'],
    [NaN, '0 B'],
    [512, '512 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [250 * 1024 * 1024, '250 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
    [5000 * 1024 ** 3, '5000 GB'],
  ])('%d -> %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});
