import { addMonths, differenceInCalendarDays, differenceInCalendarMonths, getDaysInMonth, startOfDay, startOfMonth } from 'date-fns';

export interface SafeToSpendInput {
  /** Tracked balance across the accounts the user spends from. `null` when balances aren't being tracked. */
  balancePaise: number | null;
  /** What is left of the overall budget this period, if there is one (negative when over). */
  budgetRemainingPaise: number | null;
  /** Money already promised elsewhere before the next payday, e.g. goal contributions. */
  reservedPaise?: number;
  /** Day of the month income usually arrives (1-31). Without it the period ends with the calendar month. */
  payday?: number | null;
  now: Date;
}

export interface SafeToSpend {
  /** Total that can be spent until the period ends without breaking the budget or the balance. Never negative. */
  safePaise: number;
  /** `safePaise` spread evenly over the days left, today included. */
  perDayPaise: number;
  daysLeft: number;
  /** Which limit set the number, so the UI can explain it. */
  limitedBy: 'budget' | 'balance' | 'none';
  /** The day the money is meant to last until (the payday itself, or the first of next month). */
  periodEnd: Date;
}

/** The next payday strictly after today, clamped to short months (payday 31 in February is the 28th/29th). */
export function nextPayday(payday: number, now: Date): Date {
  const today = startOfDay(now);
  const onMonth = (month: Date) => {
    const d = Math.min(Math.max(1, Math.round(payday)), getDaysInMonth(month));
    return new Date(month.getFullYear(), month.getMonth(), d);
  };
  const thisMonth = onMonth(today);
  return thisMonth.getTime() > today.getTime() ? thisMonth : onMonth(addMonths(startOfMonth(today), 1));
}

export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const today = startOfDay(input.now);
  const periodEnd = input.payday ? nextPayday(input.payday, input.now) : startOfMonth(addMonths(today, 1));
  const daysLeft = Math.max(1, differenceInCalendarDays(periodEnd, today));

  const reserved = Math.max(0, input.reservedPaise ?? 0);
  const fromBalance = input.balancePaise === null ? null : input.balancePaise - reserved;
  const fromBudget = input.budgetRemainingPaise;

  let safe: number;
  let limitedBy: SafeToSpend['limitedBy'];
  if (fromBalance === null && fromBudget === null) {
    safe = 0;
    limitedBy = 'none';
  } else if (fromBudget !== null && (fromBalance === null || fromBudget <= fromBalance)) {
    safe = fromBudget;
    limitedBy = 'budget';
  } else {
    safe = fromBalance!;
    limitedBy = 'balance';
  }
  safe = Math.max(0, safe);

  // Whole rupees, rounded down so the daily figure never promises more than is there.
  return { safePaise: safe, perDayPaise: Math.floor(safe / daysLeft / 100) * 100, daysLeft, limitedBy, periodEnd };
}

/**
 * How much to put towards a goal each month to reach it by its deadline. The current month counts, so a goal due
 * later this month needs everything now. Without a deadline there is no monthly need.
 */
export function goalMonthlyNeed(goal: { targetPaise: number; savedPaise: number; deadline: number | null }, now: Date): number | null {
  const remaining = Math.max(0, goal.targetPaise - goal.savedPaise);
  if (remaining === 0) return 0;
  if (goal.deadline === null) return null;
  const months = Math.max(1, differenceInCalendarMonths(new Date(goal.deadline), now) + 1);
  // Whole rupees, rounded up so following the advice reaches the goal.
  return Math.ceil(remaining / months / 100) * 100;
}
