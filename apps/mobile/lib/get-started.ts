export type GetStartedStep = 'first-expense' | 'upi-payment' | 'budget' | 'shortcuts' | 'backup';

export interface GetStartedState {
  transactions: number;
  upiPayments: number;
  hasOverallBudget: boolean;
  shortcutsTipSeen: boolean;
  backupOn: boolean;
}

export interface GetStartedItem {
  step: GetStartedStep;
  title: string;
  hint: string;
  done: boolean;
  optional?: boolean;
}

/** The first things worth doing, each ticked from what the app can already see. */
export function getStartedItems(s: GetStartedState): GetStartedItem[] {
  return [
    { step: 'first-expense', title: 'Add your first expense', hint: 'Try “chai 20” in Quick add', done: s.transactions > 0 },
    { step: 'upi-payment', title: 'Pay with a UPI QR', hint: 'Scan here, pay in your UPI app, and it’s logged', done: s.upiPayments > 0 },
    { step: 'budget', title: 'Set a monthly budget', hint: 'Home then shows what’s safe to spend', done: s.hasOverallBudget },
    { step: 'shortcuts', title: 'Add the tile or widget', hint: 'Log from anywhere without opening the app', done: s.shortcutsTipSeen },
    { step: 'backup', title: 'Turn on backup', hint: 'End-to-end encrypted, so only you can read it', done: s.backupOn, optional: true },
  ];
}

/** The checklist goes away once every required step is done. */
export function getStartedComplete(items: GetStartedItem[]): boolean {
  return items.every((i) => i.done || i.optional);
}
