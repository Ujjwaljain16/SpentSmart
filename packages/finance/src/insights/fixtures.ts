import { InsightTxn } from './common';

/** Test helpers: build rows on calendar dates so fixtures read like a bank statement. */
let seq = 0;
export function tx(
  date: [number, number, number],
  amountRupees: number,
  payeeName: string,
  extra: Partial<InsightTxn> = {},
): InsightTxn {
  seq += 1;
  return {
    id: `t${seq}`,
    type: 'expense',
    amountPaise: Math.round(amountRupees * 100),
    occurredAt: new Date(date[0], date[1] - 1, date[2], 12).getTime(),
    payeeName,
    payeeVpa: null,
    categoryKey: 'other',
    ...extra,
  };
}

/** Same payee and amount on the given day of each month, for `months` months ending at (year, lastMonth). */
export function monthly(year: number, lastMonth: number, months: number, day: number, amount: number, payee: string, extra: Partial<InsightTxn> = {}): InsightTxn[] {
  const out: InsightTxn[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(year, lastMonth - 1 - i, day);
    out.push(tx([d.getFullYear(), d.getMonth() + 1, d.getDate()], amount, payee, extra));
  }
  return out;
}

export const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
