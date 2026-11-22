import { BudgetStatus } from '@spentsmart/finance/ledger';
import { InsightTxn } from '@spentsmart/finance/insights/common';
import { AccountType, Category, Goal } from '@spentsmart/finance/types';

export interface AssistantTxn extends InsightTxn {
  note: string | null;
  tags: string[];
}

/** What the assistant's tools may read. The app implements it over the encrypted database; evals over a fixture. */
export interface LedgerSource {
  /** Non-deleted transactions with occurredAt in [start, end). */
  transactions(start: number, end: number): Promise<AssistantTxn[]>;
  categories(): Promise<Category[]>;
  budgets(now: number): Promise<{ categoryKey: string | null; status: BudgetStatus }[]>;
  goals(): Promise<Goal[]>;
  accounts(): Promise<{ id: string; name: string; type: AccountType; balancePaise: number; openingBalancePaise: number }[]>;
  /** Day of month income arrives, if the user set one. */
  payday(): Promise<number | null>;
}
