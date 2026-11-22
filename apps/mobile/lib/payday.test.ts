import { describe, expect, it } from 'vitest';
import { parsePayday } from './payday';

describe('parsePayday', () => {
  it.each([
    ['1', 1],
    [' 25 ', 25],
    ['31', 31],
    ['07', 7],
  ])('reads %j as %i', (text, day) => {
    expect(parsePayday(text)).toBe(day);
  });

  it.each(['', '0', '32', '2.5', '-1', 'abc', '100'])('rejects %j', (text) => {
    expect(parsePayday(text)).toBeNull();
  });
});
