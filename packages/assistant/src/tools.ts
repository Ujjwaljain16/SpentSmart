import type Anthropic from '@anthropic-ai/sdk';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { resolveCategory } from '@spentsmart/finance/categories';
import { forecastMonth } from '@spentsmart/finance/insights/forecast';
import { detectRecurring, monthlyCost } from '@spentsmart/finance/insights/recurring';
import { incomeEffect, savingsRate, spendingEffect } from '@spentsmart/finance/ledger';
import { MAX_PAISE, formatPaise } from '@spentsmart/finance/money';
import { goalMonthlyNeed, safeToSpend } from '@spentsmart/finance/safe-to-spend';
import { Category } from '@spentsmart/finance/types';
import { AssistantTxn, LedgerSource } from './ledger';

/** Amounts always leave a tool as display strings, so the model quotes instead of calculating. */
const money = (paise: number) => formatPaise(Math.round(paise));

export const PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30_days', 'last_90_days', 'this_year'] as const;
export type PeriodName = (typeof PERIODS)[number];

export function periodRange(period: PeriodName, nowMs: number): { start: number; end: number; label: string } {
  const now = new Date(nowMs);
  const today = startOfDay(now);
  const week = { weekStartsOn: 1 as const };
  const r = (start: Date, end: Date, label: string) => ({ start: start.getTime(), end: end.getTime(), label });
  switch (period) {
    case 'today':
      return r(today, addDays(today, 1), format(today, 'd MMM yyyy'));
    case 'yesterday':
      return r(subDays(today, 1), today, format(subDays(today, 1), 'd MMM yyyy'));
    case 'this_week':
      return r(startOfWeek(now, week), addDays(endOfWeek(now, week), 1), 'this week');
    case 'last_week': {
      const s = startOfWeek(subWeeks(now, 1), week);
      return r(s, addDays(s, 7), 'last week');
    }
    case 'this_month':
      return r(startOfMonth(now), addDays(startOfDay(endOfMonth(now)), 1), format(now, 'MMMM yyyy'));
    case 'last_month': {
      const s = startOfMonth(subMonths(now, 1));
      return r(s, startOfMonth(now), format(s, 'MMMM yyyy'));
    }
    case 'last_30_days':
      return r(subDays(today, 29), addDays(today, 1), 'the last 30 days');
    case 'last_90_days':
      return r(subDays(today, 89), addDays(today, 1), 'the last 90 days');
    case 'this_year':
      return r(startOfYear(now), addDays(startOfDay(endOfYear(now)), 1), format(now, 'yyyy'));
  }
}

const periodSchema = { type: 'string', enum: [...PERIODS], description: 'Calendar period. Weeks start on Monday.' } as const;
const nullable = (schema: Record<string, unknown>, description?: string) => ({ anyOf: [schema, { type: 'null' }], ...(description ? { description } : {}) });

/**
 * Tool definitions sent to the model. Strict schemas (every property required, nullable where optional) so the
 * inputs always validate. Mutating tools only propose; the app asks the user before anything is saved.
 */
export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_summary',
    description: 'Income, spending, net and savings rate for a period, with the top spending categories. Spending is expenses minus refunds; transfers between own accounts are excluded.',
    strict: true,
    input_schema: { type: 'object', properties: { period: periodSchema }, required: ['period'], additionalProperties: false },
  },
  {
    name: 'compare_periods',
    description: 'Compare spending in two periods, overall and per category, with the change already calculated.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { current: periodSchema, previous: periodSchema },
      required: ['current', 'previous'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_transactions',
    description: 'Find transactions by text (payee or note), category, type, date range or amount. Returns the total and count of all matches and up to `limit` of the most recent ones.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        text: nullable({ type: 'string' }, 'Matched against payee, note and tags, case-insensitive.'),
        category: nullable({ type: 'string' }, 'Category name, e.g. "Food".'),
        type: nullable({ type: 'string', enum: ['expense', 'income', 'refund', 'transfer'] }),
        period: nullable(periodSchema),
        from_date: nullable({ type: 'string', format: 'date' }, 'Inclusive. Ignored when period is set.'),
        to_date: nullable({ type: 'string', format: 'date' }, 'Inclusive. Ignored when period is set.'),
        min_amount_rupees: nullable({ type: 'number' }),
        max_amount_rupees: nullable({ type: 'number' }),
        limit: { type: 'integer', description: '1 to 20.' },
      },
      required: ['text', 'category', 'type', 'period', 'from_date', 'to_date', 'min_amount_rupees', 'max_amount_rupees', 'limit'],
      additionalProperties: false,
    },
  },
  {
    name: 'budget_status',
    description: 'Every active budget this month: limit, spent, left, and whether the current pace stays within it.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'upcoming_recurring',
    description: 'Detected bills and subscriptions, their usual amount, next expected date, and their total monthly cost.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'can_i_afford',
    description: 'Whether a purchase fits: safe-to-spend until payday or month end, the month-end spending forecast, and what is left after the purchase.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { amount_rupees: { type: 'number', description: 'Greater than 0.' } },
      required: ['amount_rupees'],
      additionalProperties: false,
    },
  },
  {
    name: 'goals_status',
    description: 'Savings goals: target, saved so far, and the monthly amount needed to reach each by its deadline.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'create_transaction',
    description: 'Propose recording a transaction. Nothing is saved until the user confirms it in the app.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        amount_rupees: { type: 'number', description: 'Greater than 0.' },
        type: { type: 'string', enum: ['expense', 'income', 'refund'] },
        payee: { type: 'string' },
        category: nullable({ type: 'string' }, 'Category name; null to let the app pick.'),
        date: nullable({ type: 'string', format: 'date' }, 'Null for today.'),
        note: nullable({ type: 'string' }),
      },
      required: ['amount_rupees', 'type', 'payee', 'category', 'date', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_goal',
    description: 'Propose a new savings goal. Nothing is saved until the user confirms it in the app.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target_rupees: { type: 'number', description: 'Greater than 0.' },
        deadline: nullable({ type: 'string', format: 'date' }),
      },
      required: ['name', 'target_rupees', 'deadline'],
      additionalProperties: false,
    },
  },
];

export type Proposal =
  | { kind: 'transaction'; amountPaise: number; type: 'expense' | 'income' | 'refund'; payeeName: string; categoryKey: string; occurredAt: number; note: string | null }
  | { kind: 'goal'; name: string; targetPaise: number; deadline: number | null };

export interface ToolOutcome {
  /** JSON-serialisable result given back to the model. */
  result: Record<string, unknown>;
  isError?: boolean;
  /** Set by mutating tools: what the app must confirm with the user before saving. */
  proposal?: Proposal;
}

class ToolInputError extends Error {}

function rupeesToPaise(rupees: unknown, field: string): number {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees) || rupees <= 0) throw new ToolInputError(`${field} must be a positive number`);
  const paise = Math.round(rupees * 100);
  if (paise > MAX_PAISE) throw new ToolInputError(`${field} is too large`);
  return paise;
}

function parseDate(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new ToolInputError(`${field} must be YYYY-MM-DD`);
  const d = parse(value, 'yyyy-MM-dd', new Date(2000, 0, 1));
  if (!isValid(d)) throw new ToolInputError(`${field} must be YYYY-MM-DD`);
  return d.getTime();
}

function findCategory(categories: readonly Category[], name: unknown): Category | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  const n = name.trim().toLowerCase();
  return categories.find((c) => c.label.toLowerCase() === n || c.key === n) ?? null;
}

function totals(rows: readonly AssistantTxn[]) {
  let income = 0;
  let spending = 0;
  const byCategory = new Map<string, number>();
  for (const t of rows) {
    income += incomeEffect(t);
    const s = spendingEffect(t);
    spending += s;
    if (s !== 0) byCategory.set(t.categoryKey, (byCategory.get(t.categoryKey) ?? 0) + s);
  }
  return { income, spending, byCategory };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

type Handler = (input: Record<string, unknown>, ledger: LedgerSource, now: number) => Promise<ToolOutcome>;

const HANDLERS: Record<string, Handler> = {
  async get_summary(input, ledger, now) {
    const range = periodRange(input.period as PeriodName, now);
    const [rows, categories] = await Promise.all([ledger.transactions(range.start, range.end), ledger.categories()]);
    const t = totals(rows);
    const top = [...t.byCategory].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      result: {
        period: range.label,
        income: money(t.income),
        spending: money(t.spending),
        net: money(t.income - t.spending),
        savings_rate_percent: savingsRate(t.income, t.spending),
        transaction_count: rows.filter((r) => r.type !== 'transfer').length,
        top_categories: top.map(([k, v]) => ({ category: resolveCategory(categories, k).label, spending: money(v), share_percent: pct(v, t.spending) })),
      },
    };
  },

  async compare_periods(input, ledger, now) {
    const a = periodRange(input.current as PeriodName, now);
    const b = periodRange(input.previous as PeriodName, now);
    const [ra, rb, categories] = await Promise.all([ledger.transactions(a.start, a.end), ledger.transactions(b.start, b.end), ledger.categories()]);
    const ta = totals(ra);
    const tb = totals(rb);
    const keys = new Set([...ta.byCategory.keys(), ...tb.byCategory.keys()]);
    const rows = [...keys]
      .map((k) => {
        const cur = Math.max(0, ta.byCategory.get(k) ?? 0);
        const prev = Math.max(0, tb.byCategory.get(k) ?? 0);
        return { k, cur, prev, diff: cur - prev };
      })
      .filter((r) => r.cur > 0 || r.prev > 0)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    const diff = ta.spending - tb.spending;
    return {
      result: {
        current: { period: a.label, spending: money(ta.spending), income: money(ta.income) },
        previous: { period: b.label, spending: money(tb.spending), income: money(tb.income) },
        spending_change: `${diff >= 0 ? 'up' : 'down'} ${money(Math.abs(diff))}`,
        spending_change_percent: tb.spending > 0 ? Math.round((diff / tb.spending) * 100) : null,
        note: a.end > now ? `${a.label} is not over yet, so it covers fewer days than ${b.label}.` : null,
        by_category: rows.slice(0, 8).map((r) => ({
          category: resolveCategory(categories, r.k).label,
          current: money(r.cur),
          previous: money(r.prev),
          change: `${r.diff >= 0 ? 'up' : 'down'} ${money(Math.abs(r.diff))}`,
        })),
      },
    };
  },

  async search_transactions(input, ledger, now) {
    let start = 0;
    let end = now + 1;
    if (input.period) ({ start, end } = periodRange(input.period as PeriodName, now));
    else {
      const from = parseDate(input.from_date, 'from_date');
      const to = parseDate(input.to_date, 'to_date');
      if (from !== null) start = from;
      if (to !== null) end = addDays(to, 1).getTime();
    }
    const categories = await ledger.categories();
    let category: Category | null = null;
    if (input.category) {
      category = findCategory(categories, input.category);
      if (!category) return { result: { error: `No category called "${String(input.category)}"`, categories: categories.map((c) => c.label) }, isError: true };
    }
    const text = typeof input.text === 'string' ? input.text.trim().toLowerCase() : '';
    const min = input.min_amount_rupees == null ? null : rupeesToPaise(input.min_amount_rupees, 'min_amount_rupees');
    const max = input.max_amount_rupees == null ? null : rupeesToPaise(input.max_amount_rupees, 'max_amount_rupees');
    const limit = Math.min(20, Math.max(1, Number(input.limit) || 10));

    const rows = (await ledger.transactions(start, end))
      .filter((t) => (input.type ? t.type === input.type : t.type !== 'transfer'))
      .filter((t) => !category || t.categoryKey === category.key)
      .filter((t) => !text || t.payeeName.toLowerCase().includes(text) || (t.note ?? '').toLowerCase().includes(text) || t.tags.includes(text.replace(/^#/, '')))
      .filter((t) => (min === null || t.amountPaise >= min) && (max === null || t.amountPaise <= max))
      .sort((a, b) => b.occurredAt - a.occurredAt);
    const total = rows.reduce((s, t) => s + (t.type === 'refund' ? -t.amountPaise : t.amountPaise), 0);
    return {
      result: {
        match_count: rows.length,
        total: money(total),
        total_note: 'Refunds count as negative.',
        showing: Math.min(limit, rows.length),
        transactions: rows.slice(0, limit).map((t) => ({
          date: format(t.occurredAt, 'yyyy-MM-dd'),
          payee: t.payeeName,
          amount: money(t.amountPaise),
          type: t.type,
          category: resolveCategory(categories, t.categoryKey).label,
          note: t.note,
        })),
      },
    };
  },

  async budget_status(_input, ledger, now) {
    const [budgets, categories] = await Promise.all([ledger.budgets(now), ledger.categories()]);
    if (budgets.length === 0) return { result: { budgets: [], message: 'No budgets are set.' } };
    return {
      result: {
        budgets: budgets.map((b) => ({
          budget: b.categoryKey === null ? 'Overall monthly budget' : resolveCategory(categories, b.categoryKey).label,
          limit: money(b.status.availablePaise),
          spent: money(b.status.spentPaise),
          left: b.status.over ? money(0) : money(b.status.remainingPaise),
          over_by: b.status.over ? money(-b.status.remainingPaise) : null,
          percent_used: b.status.percent,
          projected_month_end: money(b.status.projectedPaise),
          on_track: b.status.onTrack,
        })),
      },
    };
  },

  async upcoming_recurring(_input, ledger, now) {
    const rows = await ledger.transactions(now - 400 * 86_400_000, now + 1);
    const active = detectRecurring(rows, now).filter((r) => r.active);
    return {
      result: {
        monthly_total: money(active.reduce((s, r) => s + monthlyCost(r), 0)),
        bills: active.map((r) => ({
          payee: r.payeeName,
          usual_amount: money(r.typicalAmountPaise),
          cadence: r.cadence,
          next_expected: format(r.nextExpectedAt, 'yyyy-MM-dd'),
          monthly_cost: money(monthlyCost(r)),
          confidence: r.confidence,
        })),
      },
    };
  },

  async can_i_afford(input, ledger, now) {
    const amount = rupeesToPaise(input.amount_rupees, 'amount_rupees');
    const [rows, budgets, accounts, payday] = await Promise.all([
      ledger.transactions(now - 400 * 86_400_000, now + 1),
      ledger.budgets(now),
      ledger.accounts(),
      ledger.payday(),
    ]);
    const overall = budgets.find((b) => b.categoryKey === null) ?? null;
    const balancePaise = accounts.some((a) => a.openingBalancePaise !== 0)
      ? accounts.filter((a) => a.type !== 'credit').reduce((s, a) => s + a.balancePaise, 0)
      : null;
    const safe = safeToSpend({ balancePaise, budgetRemainingPaise: overall?.status.remainingPaise ?? null, payday, now: new Date(now) });
    const forecast = forecastMonth(rows, detectRecurring(rows, now), now);
    const fits = safe.limitedBy !== 'none' && amount <= safe.safePaise;
    return {
      result: {
        amount: money(amount),
        verdict: safe.limitedBy === 'none' ? 'unknown: no budget or account balances are set' : fits ? 'fits' : 'does not fit',
        safe_to_spend_until_period_end: money(safe.safePaise),
        period_ends: format(safe.periodEnd, 'yyyy-MM-dd'),
        limited_by: safe.limitedBy,
        left_after_purchase: safe.limitedBy === 'none' ? null : money(Math.max(0, safe.safePaise - amount)),
        short_by: safe.limitedBy !== 'none' && !fits ? money(amount - safe.safePaise) : null,
        month_end_spending_forecast: { low: money(forecast.lowPaise), likely: money(forecast.likelyPaise), high: money(forecast.highPaise) },
      },
    };
  },

  async goals_status(_input, ledger, now) {
    const goals = (await ledger.goals()).filter((g) => !g.archived);
    return {
      result: {
        goals: goals.map((g) => {
          const need = goalMonthlyNeed(g, new Date(now));
          return {
            goal: g.name,
            target: money(g.targetPaise),
            saved: money(g.savedPaise),
            remaining: money(Math.max(0, g.targetPaise - g.savedPaise)),
            percent: g.targetPaise > 0 ? Math.round((g.savedPaise / g.targetPaise) * 100) : 0,
            deadline: g.deadline ? format(g.deadline, 'yyyy-MM-dd') : null,
            needed_per_month: need === null ? null : money(need),
          };
        }),
      },
    };
  },

  async create_transaction(input, ledger, now) {
    const amountPaise = rupeesToPaise(input.amount_rupees, 'amount_rupees');
    const type = input.type;
    if (type !== 'expense' && type !== 'income' && type !== 'refund') throw new ToolInputError('type must be expense, income or refund');
    const payee = typeof input.payee === 'string' ? input.payee.trim().slice(0, 60) : '';
    if (!payee) throw new ToolInputError('payee is required');
    const categories = await ledger.categories();
    const category = type === 'income' ? findCategory(categories, 'income') : (findCategory(categories, input.category) ?? findCategory(categories, 'other'));
    const occurredAt = parseDate(input.date, 'date') ?? now;
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 80) : null;
    const proposal: Proposal = { kind: 'transaction', amountPaise, type, payeeName: payee, categoryKey: category?.key ?? 'other', occurredAt, note };
    return {
      proposal,
      result: {
        status: 'waiting for the user to confirm in the app; not saved yet',
        amount: money(amountPaise),
        type,
        payee,
        category: category?.label ?? 'Other',
        date: format(occurredAt, 'yyyy-MM-dd'),
      },
    };
  },

  async create_goal(input) {
    const targetPaise = rupeesToPaise(input.target_rupees, 'target_rupees');
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 40) : '';
    if (!name) throw new ToolInputError('name is required');
    const deadline = parseDate(input.deadline, 'deadline');
    return {
      proposal: { kind: 'goal', name, targetPaise, deadline },
      result: { status: 'waiting for the user to confirm in the app; not saved yet', goal: name, target: money(targetPaise), deadline: deadline ? format(deadline, 'yyyy-MM-dd') : null },
    };
  },
};

/** Run one tool call. Bad input comes back as an error result the model can correct, never as a thrown error. */
export async function runTool(name: string, input: unknown, ledger: LedgerSource, now: number): Promise<ToolOutcome> {
  const handler = HANDLERS[name];
  if (!handler) return { result: { error: `Unknown tool ${name}` }, isError: true };
  if (typeof input !== 'object' || input === null) return { result: { error: 'Input must be an object' }, isError: true };
  try {
    return await handler(input as Record<string, unknown>, ledger, now);
  } catch (error) {
    if (error instanceof ToolInputError) return { result: { error: error.message }, isError: true };
    throw error;
  }
}

export const MUTATING_TOOLS = new Set(['create_transaction', 'create_goal']);
