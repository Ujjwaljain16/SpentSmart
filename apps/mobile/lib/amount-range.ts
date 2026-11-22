import { parseRupees } from '@spentsmart/finance/money';

export interface AmountRange {
  minPaise: number | null;
  maxPaise: number | null;
  /** A box holds something that is not an amount; that bound is ignored. */
  invalid: boolean;
}

/** Reads the min/max rupee boxes on Activity. An empty box means no bound, and a reversed range is swapped. */
export function parseAmountRange(minText: string, maxText: string): AmountRange {
  const read = (text: string) => (text.trim() === '' ? { paise: null, ok: true } : { paise: parseRupees(text), ok: parseRupees(text) !== null });
  const min = read(minText);
  const max = read(maxText);
  let minPaise = min.paise;
  let maxPaise = max.paise;
  if (minPaise !== null && maxPaise !== null && minPaise > maxPaise) [minPaise, maxPaise] = [maxPaise, minPaise];
  return { minPaise, maxPaise, invalid: !min.ok || !max.ok };
}
