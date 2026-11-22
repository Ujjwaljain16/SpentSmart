import { Paise, formatPaise } from '../money';
import { DAY_MS, Evidence, InsightTxn, isSpending, median, payeeKey } from './common';

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const CADENCES: readonly { cadence: Cadence; days: number; tolerance: number }[] = [
  { cadence: 'weekly', days: 7, tolerance: 1.5 },
  { cadence: 'monthly', days: 30.4, tolerance: 4 },
  { cadence: 'quarterly', days: 91.3, tolerance: 8 },
  { cadence: 'yearly', days: 365.25, tolerance: 15 },
];

/** Fewest payments before a pattern counts. Yearly bills can't wait three years, so they need two. */
const MIN_OCCURRENCES: Record<Cadence, number> = { weekly: 4, monthly: 3, quarterly: 3, yearly: 2 };

export interface RecurringPayment {
  key: string;
  payeeName: string;
  categoryKey: string;
  cadence: Cadence;
  typicalAmountPaise: Paise;
  lastAt: number;
  nextExpectedAt: number;
  /** 0–1. Built from how regular the gaps are, how stable the amount is and how many payments there are. */
  confidence: number;
  /** Still expected: the last payment is no more than one and a half periods ago. */
  active: boolean;
  evidence: Evidence;
}

function classify(gapDays: number): (typeof CADENCES)[number] | null {
  return CADENCES.find((c) => Math.abs(gapDays - c.days) <= c.tolerance) ?? null;
}

/**
 * Find bills and subscriptions: the same payee, paid at a steady rhythm, for a similar amount. Deliberately
 * conservative. A coffee shop visited every few days isn't a subscription, so irregular gaps or swinging amounts
 * rule a payee out instead of lowering the score.
 */
export function detectRecurring(transactions: readonly InsightTxn[], now: number): RecurringPayment[] {
  const groups = new Map<string, InsightTxn[]>();
  for (const t of transactions) {
    if (!isSpending(t) || t.occurredAt > now) continue;
    const key = payeeKey(t);
    if (key === 'name:') continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const out: RecurringPayment[] = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.occurredAt - b.occurredAt);

    const gaps = rows.slice(1).map((t, i) => (t.occurredAt - rows[i]!.occurredAt) / DAY_MS);
    const medianGap = median(gaps);
    const match = classify(medianGap);
    if (!match || rows.length < MIN_OCCURRENCES[match.cadence]) continue;

    // Every gap has to fit the rhythm (one skipped period is allowed: a missed month still reads as monthly).
    const regular = gaps.filter((g) => {
      const periods = Math.round(g / match.days);
      return periods >= 1 && periods <= 2 && Math.abs(g - periods * match.days) <= match.tolerance * periods;
    });
    if (regular.length < gaps.length) continue;

    const amounts = rows.map((r) => r.amountPaise);
    const typical = median(amounts);
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - typical) / typical));
    if (maxDeviation > 0.2) continue;

    const gapSpread = median(gaps.map((g) => Math.abs(g - Math.round(g / match.days) * match.days))) / match.tolerance;
    const regularity = 1 - Math.min(1, gapSpread);
    const stability = 1 - maxDeviation / 0.2;
    const volume = Math.min(1, rows.length / (MIN_OCCURRENCES[match.cadence] + 3));
    const confidence = Math.round((0.45 * regularity + 0.35 * stability + 0.2 * volume) * 100) / 100;

    const last = rows[rows.length - 1]!;
    const periodMs = match.days * DAY_MS;
    const nextExpectedAt = Math.round(last.occurredAt + periodMs);

    out.push({
      key,
      payeeName: last.payeeName,
      categoryKey: last.categoryKey,
      cadence: match.cadence,
      typicalAmountPaise: Math.round(typical),
      lastAt: last.occurredAt,
      nextExpectedAt,
      confidence,
      active: now - last.occurredAt <= periodMs * 1.5,
      evidence: {
        transactionIds: rows.map((r) => r.id),
        formula:
          `${rows.length} payments to ${last.payeeName}, a median of ${Math.round(medianGap)} days apart ` +
          `(${match.cadence} is ${Math.round(match.days)} ± ${match.tolerance} days), ` +
          `amounts within ${Math.round(maxDeviation * 100)}% of ${formatPaise(Math.round(typical))}.`,
        period: { start: rows[0]!.occurredAt, end: last.occurredAt },
      },
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence || b.typicalAmountPaise - a.typicalAmountPaise);
}

/** Rough monthly cost of a recurring payment, for "your subscriptions cost ₹X a month". */
export function monthlyCost(r: Pick<RecurringPayment, 'cadence' | 'typicalAmountPaise'>): Paise {
  const perMonth = { weekly: 30.4 / 7, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.cadence];
  return Math.round(r.typicalAmountPaise * perMonth);
}
