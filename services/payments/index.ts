import { Linking } from 'react-native';
import { KNOWN_UPI_APPS, knownAppByPackage } from '@/constants/upi-apps';
import { Repositories } from '@/db/repositories';
import { PaymentAttempt } from '@/db/repositories/attempts';
import { PaymentDraft } from '@/domain/payment-draft';
import { Paise } from '@/domain/money';
import { buildPayUri, buildPayUriWithoutAmount, generateTxnRef } from '@/domain/upi/build';
import { suggestionFor, UpiResponse } from '@/domain/upi/response';
import { log } from '@/lib/logger';
import { InstalledUpiApp, loadUpiIntent } from '@/modules/upi-intent';
import { saveQrToGallery } from '../qr-gallery';
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

export interface BeginQrGalleryInput {
  draft: PaymentDraft;
  amountPaise: Paise | undefined;
  note: string | undefined;
  categoryKey: string;
  appPackage: string | null;
  /** Draw the QR for the payment and return its PNG (base64), or null if it could not be drawn. */
  renderQr: () => Promise<string | null>;
}

export type QrGalleryOutcome =
  | { kind: 'ready'; attempt: PaymentAttempt }
  | { kind: 'permission_denied' }
  | { kind: 'failed' };

/**
 * Pay via "scan from gallery": save the payee's QR to the gallery, then the user imports it in their UPI app.
 * This is the route UPI apps accept for personal UPI IDs (they block payments *started by another app* for
 * those), because to the UPI app it is an ordinary QR scan. The attempt is persisted first and discarded again
 * if the QR could not be saved, so nothing phantom is left behind.
 */
export async function beginQrGalleryPayment(repos: Repositories, input: BeginQrGalleryInput): Promise<QrGalleryOutcome> {
  const attempt = await repos.attempts.create({
    vpa: input.draft.vpa,
    payeeName: input.draft.payeeName,
    amountPaise: input.amountPaise ?? null,
    note: input.note ?? null,
    categoryKey: input.categoryKey,
    appPackage: input.appPackage,
    txnRef: null,
  });
  const png = await input.renderQr();
  const saved = png ? await saveQrToGallery(png) : 'error';
  if (saved === 'saved') return { kind: 'ready', attempt };
  await repos.attempts.discard(attempt.id);
  return saved === 'denied' ? { kind: 'permission_denied' } : { kind: 'failed' };
}

export async function openAppLauncher(packageName: string): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.launchApp(packageName);
  } catch {
    return false;
  }
}
