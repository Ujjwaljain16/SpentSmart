/**
 * Indian digit grouping for amount fields while the user types (1,50,000.50). The screens keep the plain text
 * ("150000.50"); only what the field shows is grouped, so parsing and validation are unchanged.
 */
export function groupAmountInput(raw: string): string {
  const match = /^(-?)(\d*)(\.\d*)?$/.exec(raw);
  if (!match) return raw; // Not a plain number yet; show it as typed so the error hint makes sense.
  const [, sign, int, frac = ''] = match;
  if (int.length <= 3) return sign + int + frac;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}${rest},${last3}${frac}`;
}

/** Undo the grouping (and any commas the user pasted) before handing the text back to the screen. */
export function ungroupAmountInput(shown: string): string {
  return shown.replace(/,/g, '');
}
