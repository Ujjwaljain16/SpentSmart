import { describe, expect, it } from 'vitest';
import { parseAmountRange } from './amount-range';

describe('parseAmountRange', () => {
  it('treats empty boxes as no bound', () => {
    expect(parseAmountRange('', '  ')).toEqual({ minPaise: null, maxPaise: null, invalid: false });
  });

  it('reads rupees into paise', () => {
    expect(parseAmountRange('100', '1,250.50')).toEqual({ minPaise: 10_000, maxPaise: 1_25_050, invalid: false });
    expect(parseAmountRange('', '500')).toEqual({ minPaise: null, maxPaise: 50_000, invalid: false });
  });

  it('swaps a reversed range', () => {
    expect(parseAmountRange('900', '100')).toEqual({ minPaise: 10_000, maxPaise: 90_000, invalid: false });
  });

  it('flags and ignores a box that is not an amount', () => {
    expect(parseAmountRange('abc', '200')).toEqual({ minPaise: null, maxPaise: 20_000, invalid: true });
    expect(parseAmountRange('0', '')).toEqual({ minPaise: null, maxPaise: null, invalid: true });
  });
});
