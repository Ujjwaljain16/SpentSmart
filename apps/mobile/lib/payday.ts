/** Reads a payday typed as a day of the month, 1 to 31. Anything else is null. */
export function parsePayday(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const day = Number(trimmed);
  return day >= 1 && day <= 31 ? day : null;
}
