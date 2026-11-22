import { messageFingerprint } from '@spentsmart/finance/capture/fingerprint';
import { parsePaymentText } from '@spentsmart/finance/capture/payment-text';
import { Category } from '@spentsmart/finance/types';
import { paiseToDecimal } from '@spentsmart/finance/money';
import { parseQuickAdd } from '@spentsmart/finance/quick-add';
import { parseUpiUri } from '@spentsmart/finance/upi/parse';
import { interpretLaunchResult } from '@spentsmart/finance/upi/response';
import { Repositories } from '@/db/repositories';
import { CapturedPayment } from '@/db/repositories/captured';
import { DEFAULT_BANK_ACCOUNT_ID, DEFAULT_CASH_ACCOUNT_ID } from '@/db/migrations';
import { log } from '@/lib/logger';
import { loadUpiIntent } from '@/modules/upi-intent';

const native = loadUpiIntent();

/** Capture and the UPI proxy need the native module (Android builds only). */
export const captureAvailable = native !== null;

export async function captureStatus(): Promise<{ enabled: boolean; accessGranted: boolean }> {
  if (!native) return { enabled: false, accessGranted: false };
  try {
    return await native.captureStatus();
  } catch {
    return { enabled: false, accessGranted: false };
  }
}

export async function setCaptureEnabled(enabled: boolean): Promise<void> {
  await native?.setCaptureEnabled(enabled);
}

export async function openNotificationAccess(): Promise<void> {
  await native?.openNotificationAccessSettings();
}

export async function proxyEnabled(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.proxyEnabled();
  } catch {
    return false;
  }
}

export async function setProxy(enabled: boolean, targetPackage: string | null): Promise<void> {
  await native?.setProxy(enabled, targetPackage);
}

/** Best guess at the category, using the same rules (and the user's own history) as quick add. */
export function guessCategory(c: Pick<CapturedPayment, 'direction' | 'amountPaise' | 'payeeName'>, categories: readonly Category[], learned?: ReadonlyMap<string, string>): string {
  if (c.direction === 'credit') return 'income';
  const draft = parseQuickAdd(`${paiseToDecimal(c.amountPaise)} ${c.payeeName ?? ''}`.trim(), categories, new Date(), { learned });
  return draft.categoryKey;
}

/**
 * Move everything the native side collected while the app was closed into the database. Proxied payments go first:
 * a successful one is recorded straight away (the UPI app confirmed it), so the notification for the same payment is
 * then recognised as already recorded instead of landing in the inbox. Returns how many new items await review.
 */
export async function collectCaptured(repos: Repositories): Promise<number> {
  if (!native) return 0;
  let fresh = 0;

  try {
    const categories = await repos.categories.list();
    for (const p of await native.drainProxied()) {
      const parsed = parseUpiUri(p.uri);
      if (!parsed.ok || parsed.data.amountPaise === undefined) continue;
      const outcome = interpretLaunchResult({ resultCode: p.resultCode, response: p.response });
      if (outcome.outcome === 'failure' || outcome.outcome === 'cancelled') continue;
      const base = { direction: 'debit' as const, amountPaise: parsed.data.amountPaise, payeeName: parsed.data.payeeName, occurredAt: p.at };
      if (outcome.outcome === 'success') {
        const txn = await repos.transactions.insert({
          amountPaise: base.amountPaise,
          type: 'expense',
          categoryKey: guessCategory(base, categories),
          payeeName: base.payeeName,
          payeeVpa: parsed.data.vpa,
          paymentMethod: 'upi',
          occurredAt: p.at,
          verifiedBy: 'upi_result',
          upiTxnId: outcome.txnId ?? null,
          upiTxnRef: outcome.txnRef ?? null,
          source: 'scan',
        });
        await repos.captured.settleTwins('debit', base.amountPaise, p.at, txn.id);
      } else if ((await repos.captured.add({ ...base, source: 'proxy', app: p.caller, payeeVpa: parsed.data.vpa, reference: outcome.txnRef ?? null, via: 'upi' })) === 'added') {
        fresh++;
      }
    }
  } catch (error) {
    log.warn('Could not read proxied payments', error);
  }

  try {
    for (const n of await native.drainCaptured()) {
      const parsed = parsePaymentText(n.text);
      if (!parsed) continue;
      const fingerprint = messageFingerprint(n.app, n.text);
      if ((await repos.captured.add({ ...parsed, source: 'notification', app: n.app, occurredAt: n.at }, fingerprint)) === 'added') fresh++;
    }
  } catch (error) {
    log.warn('Could not read captured payments', error);
  }

  await repos.captured.cleanup().catch(() => undefined);
  return fresh;
}

/** Turn a captured payment into a transaction. A cash withdrawal becomes a transfer to Cash, not spending. */
export async function addCaptured(repos: Repositories, c: CapturedPayment, choice: { categoryKey: string; payeeName: string }): Promise<void> {
  if (c.direction === 'debit' && c.via === 'atm') {
    const { out } = await repos.transactions.createTransfer({
      fromAccountId: DEFAULT_BANK_ACCOUNT_ID,
      toAccountId: DEFAULT_CASH_ACCOUNT_ID,
      amountPaise: c.amountPaise,
      occurredAt: c.occurredAt,
      note: choice.payeeName,
    });
    await repos.captured.markAdded(c.id, out.id);
    return;
  }
  const txn = await repos.transactions.insert({
    amountPaise: c.amountPaise,
    type: c.direction === 'debit' ? 'expense' : 'income',
    categoryKey: choice.categoryKey,
    payeeName: choice.payeeName,
    payeeVpa: c.payeeVpa,
    paymentMethod: c.via === 'card' ? 'other' : c.via === 'upi' || c.payeeVpa ? 'upi' : 'bank',
    occurredAt: c.occurredAt,
    verifiedBy: 'manual',
    upiTxnRef: c.reference,
    source: 'import',
  });
  await repos.captured.markAdded(c.id, txn.id);
}
