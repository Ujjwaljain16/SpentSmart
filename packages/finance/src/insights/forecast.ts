import { endOfMonth, getDaysInMonth, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { Paise, formatPaise } from '../money';
import { spendingEffect } from '../ledger';
import { DAY_MS, Evidence, InsightTxn, median, payeeKey } from './common';
import { RecurringPayment } from './recurring';

export interface MonthForecast {
  spentPaise: Paise;
  /** Recurring bills expected later this month that haven't been paid yet. */
  upcomingBills: { payeeName: string; amountPaise: Paise; expectedAt: number }[];
  upcomingPaise: Paise;
  lowPaise: Paise;
  likelyPaise: Paise;
  highPaise: Paise;
  daysLeft: number;
  evidence: Evidence;
}

/**
 * Month-end spending as a range. Known recurring bills are added once at their expected amount instead of being
 * smeared into a daily average, and the day-to-day part is projected from the daily rates of recent months and this
 * month so far, so the range reflects how much those rates actually vary.
 */
export function forecastMonth(
  transactions: readonly InsightTxn[],
  recurring: readonly RecurringPayment[],
  nowMs: number,
): MonthForecast {
  const now = new Date(nowMs);
  const monthStart = startOfMonth(now).getTime();
  const monthEnd = endOfMonth(now).getTime() + 1;
  const today = startOfDay(now).getTime();
  const daysInMonth = getDaysInMonth(now);
  const elapsedDays = Math.max(1, Math.round((today - monthStart) / DAY_MS) + 1);
  const daysLeft = daysInMonth - elapsedDays;

  const billKeys = new Set(recurring.filter((r) => r.active).map((r) => r.key));
  const isBill = (t: InsightTxn) => billKeys.has(payeeKey(t));

  const thisMonth = transactions.filter((t) => t.occurredAt >= monthStart && t.occurredAt <= nowMs);
  const spentPaise = Math.max(0, thisMonth.reduce((s, t) => s + spendingEffect(t), 0));
  const variableSoFar = Math.max(0, thisMonth.filter((t) => !isBill(t)).reduce((s, t) => s + spendingEffect(t), 0));

  // A bill counts as upcoming when its next date falls in the rest of this month and it hasn't been paid this month.
  const paidThisMonth = new Set(thisMonth.filter(isBill).map(payeeKey));
  const upcomingBills = recurring
    .filter((r) => r.active && r.cadence !== 'weekly' && !paidThisMonth.has(r.key) && r.nextExpectedAt >= today && r.nextExpectedAt < monthEnd)
    .map((r) => ({ payeeName: r.payeeName, amountPaise: r.typicalAmountPaise, expectedAt: r.nextExpectedAt }));
  // Weekly bills: one payment for every full week still ahead.
  for (const r of recurring) {
    if (!r.active || r.cadence !== 'weekly') continue;
    let next = r.nextExpectedAt;
    while (next < today) next += 7 * DAY_MS;
    for (; next < monthEnd; next += 7 * DAY_MS) upcomingBills.push({ payeeName: r.payeeName, amountPaise: r.typicalAmountPaise, expectedAt: next });
  }
  const upcomingPaise = upcomingBills.reduce((s, b) => s + b.amountPaise, 0);

  // Daily variable rate in each of the last three full months that have any data, plus this month so far.
  const rates: number[] = [];
  const rateNotes: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const start = subMonths(startOfMonth(now), i);
    const end = endOfMonth(start).getTime() + 1;
    // A month holding only bills (or nothing) says the user wasn't tracking day-to-day spending then, not that it was zero.
    const rows = transactions.filter((t) => t.occurredAt >= start.getTime() && t.occurredAt < end && !isBill(t));
    if (!rows.some((t) => t.type === 'expense')) continue;
    const variable = Math.max(0, rows.reduce((s, t) => s + spendingEffect(t), 0));
    const rate = variable / getDaysInMonth(start);
    rates.push(rate);
    rateNotes.push(`${formatPaise(Math.round(rate))}/day`);
  }
  const currentRate = variableSoFar / elapsedDays;
  rates.push(currentRate);
  rateNotes.push(`${formatPaise(Math.round(currentRate))}/day this month`);

  const sorted = [...rates].sort((a, b) => a - b);
  // With a single rate there is nothing to measure spread from, so allow ±25%.
  const lowRate = sorted.length > 1 ? sorted[0]! : currentRate * 0.75;
  const highRate = sorted.length > 1 ? sorted[sorted.length - 1]! : currentRate * 1.25;
  const likelyRate = median(rates);

  const project = (rate: number) => Math.round(spentPaise + upcomingPaise + rate * daysLeft);

  const ids = [...thisMonth.map((t) => t.id)];
  return {
    spentPaise,
    upcomingBills,
    upcomingPaise,
    lowPaise: project(lowRate),
    likelyPaise: project(likelyRate),
    highPaise: project(highRate),
    daysLeft,
    evidence: {
      transactionIds: ids,
      formula:
        `${formatPaise(spentPaise)} spent so far + ${formatPaise(upcomingPaise)} in ${upcomingBills.length} upcoming bill` +
        `${upcomingBills.length === 1 ? '' : 's'} + ${daysLeft} day${daysLeft === 1 ? '' : 's'} × day-to-day spending ` +
        `(${rateNotes.join(', ')}).`,
      period: { start: monthStart, end: monthEnd },
    },
  };
}
