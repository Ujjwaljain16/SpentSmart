import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { spendingEffect } from '../ledger';
import { Paise, formatPaise } from '../money';
import { DAY_MS, Evidence, InsightTxn, isSpending, mad, median, payeeKey } from './common';

export interface UnusualPayment {
  transactionId: string;
  payeeName: string;
  amountPaise: Paise;
  typicalPaise: Paise;
  /** How many times the usual amount. */
  ratio: number;
  evidence: Evidence;
}

/** Ignore jumps smaller than this; a ₹40 chai becoming ₹120 is not worth a flag. */
const MIN_EXTRA_PAISE = 300_00;

/**
 * Payments in the last `lookbackDays` that are far above what this payee usually costs. Needs at least four earlier
 * payments to the same payee, and uses median and median absolute deviation so one past splurge can't hide the next.
 */
export function detectUnusualPayments(transactions: readonly InsightTxn[], now: number, lookbackDays = 30): UnusualPayment[] {
  const byPayee = new Map<string, InsightTxn[]>();
  for (const t of transactions) {
    if (!isSpending(t) || t.occurredAt > now) continue;
    const key = payeeKey(t);
    if (key === 'name:') continue;
    const list = byPayee.get(key);
    if (list) list.push(t);
    else byPayee.set(key, [t]);
  }

  const out: UnusualPayment[] = [];
  const since = now - lookbackDays * DAY_MS;
  for (const rows of byPayee.values()) {
    rows.sort((a, b) => a.occurredAt - b.occurredAt);
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i]!;
      if (t.occurredAt < since) continue;
      const history = rows.slice(0, i);
      if (history.length < 4) continue;
      const amounts = history.map((h) => h.amountPaise);
      const typical = median(amounts);
      // 1.4826 scales MAD to a standard deviation for normal data; the floor stops identical history (MAD 0) from
      // flagging every tiny change.
      const spread = Math.max(1.4826 * mad(amounts), typical * 0.1);
      const threshold = typical + 3 * spread;
      if (t.amountPaise > threshold && t.amountPaise >= typical * 2 && t.amountPaise - typical >= MIN_EXTRA_PAISE) {
        const ratio = Math.round((t.amountPaise / typical) * 10) / 10;
        out.push({
          transactionId: t.id,
          payeeName: t.payeeName,
          amountPaise: t.amountPaise,
          typicalPaise: Math.round(typical),
          ratio,
          evidence: {
            transactionIds: [...history.map((h) => h.id), t.id],
            formula:
              `${formatPaise(t.amountPaise)} is ${ratio}× the usual ${formatPaise(Math.round(typical))} ` +
              `across ${history.length} earlier payments to ${t.payeeName} (flagged above ${formatPaise(Math.round(threshold))}).`,
          },
        });
      }
    }
  }
  return out.sort((a, b) => b.amountPaise - b.typicalPaise - (a.amountPaise - a.typicalPaise));
}

export interface CategoryChange {
  categoryKey: string;
  currentPaise: Paise;
  /** Average of the previous months that had spending in this category. */
  baselinePaise: Paise;
  changePaise: number;
  /** Whole percent; null when there is no baseline. */
  changePercent: number | null;
  /** At least 50% and ₹1,000 above the baseline, with at least two earlier months to compare against. */
  unusual: boolean;
  evidence: Evidence;
}

/**
 * This month so far against the same days of the previous `months` months, per category. Comparing like-for-like
 * days avoids the classic "you've spent less this month!" on the 5th.
 */
export function compareCategories(transactions: readonly InsightTxn[], nowMs: number, months = 3): CategoryChange[] {
  const now = new Date(nowMs);
  const dayOfMonth = now.getDate();
  const windows = [0, ...Array.from({ length: months }, (_, i) => i + 1)].map((back) => {
    const start = subMonths(startOfMonth(now), back);
    const cut = Math.min(start.getTime() + (nowMs - startOfMonth(now).getTime()), endOfMonth(start).getTime());
    return { back, start: start.getTime(), end: cut };
  });

  const totals = new Map<string, number[]>();
  const ids = new Map<string, string[]>();
  for (const t of transactions) {
    if (t.type !== 'expense' && t.type !== 'refund') continue;
    const w = windows.find((x) => t.occurredAt >= x.start && t.occurredAt <= x.end);
    if (!w) continue;
    const arr = totals.get(t.categoryKey) ?? new Array<number>(windows.length).fill(0);
    arr[w.back] = arr[w.back]! + spendingEffect(t);
    totals.set(t.categoryKey, arr);
    const idList = ids.get(t.categoryKey) ?? [];
    idList.push(t.id);
    ids.set(t.categoryKey, idList);
  }

  const out: CategoryChange[] = [];
  for (const [categoryKey, arr] of totals) {
    const current = Math.max(0, arr[0]!);
    const past = arr.slice(1).filter((v) => v > 0);
    const baseline = past.length > 0 ? Math.round(past.reduce((s, v) => s + v, 0) / past.length) : 0;
    const changePaise = current - baseline;
    const changePercent = baseline > 0 ? Math.round((changePaise / baseline) * 100) : null;
    out.push({
      categoryKey,
      currentPaise: current,
      baselinePaise: baseline,
      changePaise,
      changePercent,
      unusual: past.length >= 2 && current >= baseline * 1.5 && changePaise >= 1_000_00,
      evidence: {
        transactionIds: ids.get(categoryKey) ?? [],
        formula:
          `Days 1–${dayOfMonth} this month: ${formatPaise(current)}. Same days in the previous ${past.length} month` +
          `${past.length === 1 ? '' : 's'} with spending: average ${formatPaise(baseline)}.`,
        period: { start: windows[0]!.start, end: nowMs },
      },
    });
  }
  return out.filter((c) => c.currentPaise > 0 || c.baselinePaise > 0).sort((a, b) => b.changePaise - a.changePaise);
}
