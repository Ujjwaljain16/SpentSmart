import { Linking } from 'react-native';
import { KNOWN_UPI_APPS, GPAY_PACKAGE, knownAppByPackage } from '@/constants/upi-apps';
import { Repositories } from '@/db/repositories';
import { PaymentAttempt } from '@/db/repositories/attempts';
import { PaymentDraft } from '@/domain/payment-draft';
import { Paise } from '@/domain/money';
import { buildPayUri, buildPayUriWithoutAmount, generateTxnRef } from '@/domain/upi/build';
import { suggestionFor, UpiResponse } from '@/domain/upi/response';
import { log } from '@/lib/logger';
import { InstalledUpiApp, loadUpiIntent } from '@/modules/upi-intent';
import { LaunchOutcome, launchPayment, sortApps } from './launcher';

const native = loadUpiIntent();

export const hasNativeUpi = native !== null;

export interface UpiAppChoice {
  packageName: string;
  name: string;
}

/**
 * UPI apps installed on this device. Uses the native query when available; otherwise probes the well-known
 * apps' custom schemes (less reliable, and only a hint).
 */
export async function listUpiApps(): Promise<UpiAppChoice[]> {
  if (native) {
    try {
      const apps: InstalledUpiApp[] = await native.getUpiApps();
      return sortApps(apps, KNOWN_UPI_APPS.map((a) => a.packageName)).map((a) => ({
        packageName: a.packageName,
        name: knownAppByPackage(a.packageName)?.name ?? a.name,
      }));
    } catch (error) {
      log.warn('Native UPI app discovery failed', error);
    }
  }
  const found: UpiAppChoice[] = [];
  for (const app of KNOWN_UPI_APPS) {
    try {
      if (await Linking.canOpenURL(app.scheme)) found.push({ packageName: app.packageName, name: app.name });
    } catch {
      /* skip */
    }
  }
  return found;
}

export interface BeginPaymentInput {
  draft: PaymentDraft;
  amountPaise: Paise | undefined;
  note: string | undefined;
  categoryKey: string;
  appPackage: string | null;
  /** Retry mode for UPI apps that decline P2P intents carrying an amount. */
  withoutAmount?: boolean;
}

export interface BeginPaymentResult {
  attempt: PaymentAttempt;
  launch: LaunchOutcome;
  /** The UPI app's answer, when it gave one. */
  response: UpiResponse | null;
}

/**
 * Start a payment:
 *   1. persist the attempt (so it survives the app being killed while the UPI app is in front),
 *   2. launch the UPI app for a result,
 *   3. store what came back and the suggestion derived from it.
 * Nothing is recorded as an expense here; recording needs the user's confirmation (see `AttemptReview`).
 */
export async function beginPayment(repos: Repositories, input: BeginPaymentInput): Promise<BeginPaymentResult> {
  const { draft, amountPaise, note, categoryKey, appPackage, withoutAmount } = input;

  const txnRef = draft.source?.params.tr ?? generateTxnRef(Date.now());
  const attempt = await repos.attempts.create({
    vpa: draft.vpa,
    payeeName: draft.payeeName,
    amountPaise: amountPaise ?? null,
    note: note ?? null,
    categoryKey,
    appPackage,
    txnRef,
  });

  const uriInput = { vpa: draft.vpa, payeeName: draft.payeeName, amountPaise, note, txnRef, source: draft.source };
  const uri = withoutAmount ? buildPayUriWithoutAmount(uriInput) : buildPayUri(uriInput);

  const launch = await launchPayment(
    { native, openUrl: (url) => Linking.openURL(url) },
    uri,
    appPackage,
  );

  if (launch.kind === 'result') {
    await repos.attempts.markReturned(attempt.id, {
      suggestion: suggestionFor(launch.response.outcome),
      response: launch.response.raw ?? null,
    });
    return { attempt: (await repos.attempts.get(attempt.id)) ?? attempt, launch, response: launch.response };
  }

  if (launch.kind === 'no_app' || launch.kind === 'error') {
    // Nothing was launched: do not leave a phantom "awaiting confirmation" payment behind.
    await repos.attempts.discard(attempt.id);
    return { attempt: { ...attempt, status: 'discarded' }, launch, response: null };
  }

  return { attempt, launch, response: null };
}

export interface BeginQrShareInput {
  draft: PaymentDraft;
  amountPaise: Paise | undefined;
  note: string | undefined;
  categoryKey: string;
  /** Called with the txnRef that must be embedded in the QR so the attempt can be matched to it. */
  renderQr: (txnRef: string) => Promise<string | null>;
}

/**
 * Pay by sending the payee's QR to Google Pay as an image. The attempt is persisted first; if the image
 * cannot be shared, the attempt is discarded again so nothing phantom is left behind.
 */
export async function beginQrSharePayment(repos: Repositories, input: BeginQrShareInput): Promise<PaymentAttempt | null> {
  const txnRef = generateTxnRef(Date.now());
  const attempt = await repos.attempts.create({
    vpa: input.draft.vpa,
    payeeName: input.draft.payeeName,
    amountPaise: input.amountPaise ?? null,
    note: input.note ?? null,
    categoryKey: input.categoryKey,
    appPackage: GPAY_PACKAGE,
    txnRef,
  });
  const png = await input.renderQr(txnRef);
  const shared = png ? await shareQrToGooglePay(png) : false;
  if (!shared) {
    await repos.attempts.discard(attempt.id);
    return null;
  }
  return attempt;
}

/**
 * Share the payee's QR image to Google Pay, which then reads it like a scanned code. Works for payees whose
 * QR carries details the intent route loses, and without any network access (the image is rendered locally).
 */
export async function shareQrToGooglePay(base64Png: string): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.shareImage(GPAY_PACKAGE, base64Png);
  } catch (error) {
    log.warn('QR share to Google Pay failed', error);
    return false;
  }
}

export async function openAppLauncher(packageName: string): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.launchApp(packageName);
  } catch {
    return false;
  }
}
