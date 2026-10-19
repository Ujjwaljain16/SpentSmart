import { PaymentDraft } from '@/domain/payment-draft';

/**
 * Hand-off of a validated draft from the scanner to the payment screen.
 * Keeps the raw QR (which may contain signed parameters) out of route params and deep links.
 * The screen reads with `peek` (safe under React strict-mode double invocation) and clears on unmount.
 */
let current: PaymentDraft | null = null;

export function setPaymentDraft(draft: PaymentDraft): void {
  current = draft;
}

export function peekPaymentDraft(): PaymentDraft | null {
  return current;
}

export function clearPaymentDraft(): void {
  current = null;
}
