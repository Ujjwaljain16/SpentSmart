import { UpiOutcome, UpiResponse, interpretLaunchResult } from '@/domain/upi/response';
import type { InstalledUpiApp, PayWithUpiResult } from '@/modules/upi-intent';

export interface LauncherDeps {
  /** Native bridge; `null` when unavailable. */
  native: {
    payWithUpi(uri: string, packageName: string | null): Promise<PayWithUpiResult>;
  } | null;
  /** Plain Android URL opener (no result). */
  openUrl(url: string): Promise<void>;
}

export type LaunchOutcome =
  /** The UPI app answered (or was cancelled) and told us what happened. */
  | { kind: 'result'; response: UpiResponse; usedChooser: boolean }
  /** The app was opened but Android gave us no way to read a result (no native module). */
  | { kind: 'launched_without_result' }
  /** Nothing on this device can handle the payment. */
  | { kind: 'no_app' }
  /** The launch failed for another reason. */
  | { kind: 'error'; code: string };

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) return String((error as { code: unknown }).code);
  return 'ERR_UNKNOWN';
}

/**
 * Fallback ladder for starting a payment:
 *   1. the chosen app, with a result (startActivityForResult)
 *   2. if that app cannot handle the URI: the system chooser, with a result
 *   3. if the native module is unavailable: plain Linking, without a result
 * Every step that fails hands over to the next; the caller always gets a well-defined outcome.
 */
export async function launchPayment(
  deps: LauncherDeps,
  uri: string,
  packageName: string | null,
): Promise<LaunchOutcome> {
  const { native } = deps;

  if (native) {
    try {
      const raw = await native.payWithUpi(uri, packageName);
      return { kind: 'result', response: interpretLaunchResult(raw), usedChooser: !packageName };
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ERR_NO_UPI_APP' && packageName) {
        try {
          const raw = await native.payWithUpi(uri, null);
          return { kind: 'result', response: interpretLaunchResult(raw), usedChooser: true };
        } catch (chooserError) {
          const chooserCode = errorCode(chooserError);
          return chooserCode === 'ERR_NO_UPI_APP' ? { kind: 'no_app' } : { kind: 'error', code: chooserCode };
        }
      }
      if (code === 'ERR_NO_UPI_APP') return { kind: 'no_app' };
      return { kind: 'error', code };
    }
  }

  try {
    await deps.openUrl(uri);
    return { kind: 'launched_without_result' };
  } catch {
    return { kind: 'no_app' };
  }
}

export function outcomeOf(launch: LaunchOutcome): UpiOutcome {
  return launch.kind === 'result' ? launch.response.outcome : 'unknown';
}

/** Sort detected apps: well-known ones first (in our preferred order), the rest alphabetically. */
export function sortApps(apps: readonly InstalledUpiApp[], knownOrder: readonly string[]): InstalledUpiApp[] {
  const rank = (a: InstalledUpiApp) => {
    const i = knownOrder.indexOf(a.packageName);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...apps].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
