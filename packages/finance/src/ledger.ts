import { Paise } from './money';
import { Range } from './periods';

export type LedgerType = 'income' | 'expense' | 'transfer' | 'refund';
/** A transfer is stored as two rows sharing a transfer id: money leaves one account and arrives in another. */
export type TransferRole = 'out' | 'in';

export interface LedgerEntry {
  type: LedgerType;
  amountPaise: Paise;
  transferRole?: TransferRole | null;
}

/** How an entry changes the balance of the account it belongs to. */
export function balanceEffect(entry: LedgerEntry): number {
  switch (entry.type) {
    case 'income':
    case 'refund':
      return entry.amountPaise;
    case 'expense':
      return -entry.amountPaise;
    case 'transfer':
      return entry.transferRole === 'in' ? entry.amountPaise : -entry.amountPaise;
  }
}

/**
 * How an entry counts towards spending. Refunds give money back to the category they came from; moving money
 * between your own accounts is never spending.
 */
export function spendingEffect(entry: LedgerEntry): number {
  if (entry.type === 'expense') return entry.amountPaise;
  if (entry.type === 'refund') return -entry.amountPaise;
  return 0;
}

export function incomeEffect(entry: LedgerEntry): number {
  return entry.type === 'income' ? entry.amountPaise : 0;
}

export function accountBalance(openingPaise: number, entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + balanceEffect(e), openingPaise);
}

/** Share of income kept, in whole percent; `null` when there was no income to compare against. */
export function savingsRate(incomePaise: number, spendingPaise: number): number | null {
  if (incomePaise <= 0) return null;
  return Math.round(((incomePaise - spendingPaise) / incomePaise) * 100);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Straight-line projection of spending to the end of a period. Assumes the pace so far continues, so callers must
 * present it as an estimate. At least one day is treated as elapsed so the first hours of a period don't explode.
 */
export function projectPeriodSpend(spentPaise: number, period: Range, now: number): number {
  if (now >= period.end) return spentPaise;
  const elapsedDays = Math.max(1, (Math.min(now, period.end) - period.start) / DAY_MS);
  const totalDays = (period.end - period.start) / DAY_MS;
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  return Math.round(spentPaise + (spentPaise / elapsedDays) * remainingDays);
}

/** Unused budget carried into the next period. Overspending is not carried as debt. */
export function rolloverFrom(previousLimitPaise: number, previousSpentPaise: number): number {
  return Math.max(0, previousLimitPaise - previousSpentPaise);
}

export interface BudgetStatus {
  limitPaise: number;
  carriedPaise: number;
  /** limit + carried */
  availablePaise: number;
  spentPaise: number;
  /** negative when over budget */
  remainingPaise: number;
  /** whole percent of available spent; may exceed 100 */
  percent: number;
  projectedPaise: number;
  over: boolean;
  /** projected spending stays within what is available */
  onTrack: boolean;
}

export function budgetStatus(input: {
  limitPaise: number;
  spentPaise: number;
  carriedPaise?: number;
  period: Range;
  now: number;
}): BudgetStatus {
  const carriedPaise = Math.max(0, input.carriedPaise ?? 0);
  const availablePaise = input.limitPaise + carriedPaise;
  const spentPaise = Math.max(0, input.spentPaise);
  const projectedPaise = projectPeriodSpend(spentPaise, input.period, input.now);
  return {
    limitPaise: input.limitPaise,
    carriedPaise,
    availablePaise,
    spentPaise,
    remainingPaise: availablePaise - spentPaise,
    percent: availablePaise > 0 ? Math.round((spentPaise / availablePaise) * 100) : 0,
    projectedPaise,
    over: spentPaise > availablePaise,
    onTrack: projectedPaise <= availablePaise,
  };
}
