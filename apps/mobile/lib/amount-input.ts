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

/**
 * The new plain text after an edit to the grouped field. Backspacing over a comma only removes the comma, which
 * regrouping would put straight back, so the key would seem dead; delete the digit before the comma instead.
 */
export function applyAmountEdit(previousRaw: string, edited: string): string {
  const raw = ungroupAmountInput(edited);
  const shown = groupAmountInput(previousRaw);
  if (raw !== previousRaw || edited.length >= shown.length) return raw;
  let i = 0;
  while (i < edited.length && edited[i] === shown[i]) i++;
  // shown[i] is the comma that was deleted; drop the digit in front of it as well.
  return ungroupAmountInput(shown.slice(0, Math.max(0, i - 1)) + shown.slice(i + 1));
}
