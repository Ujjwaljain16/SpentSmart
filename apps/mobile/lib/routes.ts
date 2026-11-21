import type { Href } from 'expo-router';
import { PaymentDraft } from '@spentsmart/finance/payment-draft';
import { paiseToDecimal } from '@spentsmart/finance/money';

/**
 * Central place that builds navigation targets, so screens never hand-assemble route strings or params.
 * Params are always plain, validated strings; large or sensitive data (e.g. a scanned QR) goes through
 * `lib/payment-draft-store` instead of the URL.
 */
export const routes = {
  home: '/(tabs)' as Href,
  scanner: '/scanner' as Href,
  manualEntry: '/manual-entry' as Href,
  receive: '/receive' as Href,
  recoverPending: '/recover-pending' as Href,
  categoryManager: '/category-manager' as Href,
  privacyDashboard: '/privacy-dashboard' as Href,
  editProfile: '/edit-profile' as Href,
  onboarding: '/onboarding/profile-setup' as Href,
  /** The payment screen reads its draft from the draft store; params are the validated fallback. */
  payment: '/payment' as Href,
  paymentFor: (draft: PaymentDraft): Href => ({
    pathname: '/payment',
    params: {
      upiId: draft.vpa,
      payeeName: draft.payeeName,
      amount: draft.amountPaise !== undefined ? paiseToDecimal(draft.amountPaise) : '',
      transactionNote: draft.note ?? '',
      initialCategory: draft.categoryKey,
    },
  }),
  analyticsDetail: (categoryKey: string): Href => ({ pathname: '/analytics-detail', params: { category: categoryKey } }),
  editTransaction: (id: string): Href => ({ pathname: '/edit-transaction', params: { id } }),
  budgets: '/(tabs)/budgets' as Href,
  activity: '/(tabs)/history' as Href,
  quickAdd: '/quick-add' as Href,
  transfer: '/transfer' as Href,
  accounts: '/accounts' as Href,
  newAccount: '/account-edit' as Href,
  editAccount: (id: string): Href => ({ pathname: '/account-edit', params: { id } }),
  /** `null` edits the overall budget; a key edits that category's; no argument starts a new one. */
  editBudget: (categoryKey?: string | null): Href => ({
    pathname: '/budget-edit',
    params: categoryKey === undefined ? {} : categoryKey === null ? { overall: '1' } : { category: categoryKey },
  }),
  newGoal: '/goal-edit' as Href,
  editGoal: (id: string): Href => ({ pathname: '/goal-edit', params: { id } }),
};
