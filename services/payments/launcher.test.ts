import { describe, expect, it, vi } from 'vitest';
import { LauncherDeps, launchPayment, outcomeOf, sortApps } from './launcher';

const URI = 'upi://pay?pa=a.b@ybl&cu=INR';
const coded = (code: string) => Object.assign(new Error(code), { code });

function deps(partial: Partial<LauncherDeps> & { native?: LauncherDeps['native'] }): LauncherDeps {
  return { native: null, openUrl: vi.fn().mockResolvedValue(undefined), ...partial };
}

describe('launchPayment', () => {
  it('uses the chosen app and returns its parsed result', async () => {
    const payWithUpi = vi.fn().mockResolvedValue({ resultCode: -1, response: 'Status=SUCCESS&txnId=T1' });
    const out = await launchPayment(deps({ native: { payWithUpi } }), URI, 'com.phonepe.app');
    expect(payWithUpi).toHaveBeenCalledWith(URI, 'com.phonepe.app');
    expect(out).toMatchObject({ kind: 'result', usedChooser: false, response: { outcome: 'success', txnId: 'T1' } });
  });

  it('falls back to the system chooser when the chosen app cannot handle the URI', async () => {
    const payWithUpi = vi
      .fn()
      .mockRejectedValueOnce(coded('ERR_NO_UPI_APP'))
      .mockResolvedValueOnce({ resultCode: 0, response: null });
    const out = await launchPayment(deps({ native: { payWithUpi } }), URI, 'com.missing');
    expect(payWithUpi).toHaveBeenNthCalledWith(2, URI, null);
    expect(out).toMatchObject({ kind: 'result', usedChooser: true, response: { outcome: 'cancelled' } });
  });

  it('reports no_app when not even the chooser can help', async () => {
    const payWithUpi = vi.fn().mockRejectedValue(coded('ERR_NO_UPI_APP'));
    expect(await launchPayment(deps({ native: { payWithUpi } }), URI, 'com.missing')).toEqual({ kind: 'no_app' });
    expect(await launchPayment(deps({ native: { payWithUpi } }), URI, null)).toEqual({ kind: 'no_app' });
  });

  it('surfaces other native errors without hiding them behind a retry', async () => {
    const payWithUpi = vi.fn().mockRejectedValue(coded('ERR_BUSY'));
    expect(await launchPayment(deps({ native: { payWithUpi } }), URI, null)).toEqual({ kind: 'error', code: 'ERR_BUSY' });
    expect(payWithUpi).toHaveBeenCalledTimes(1);
  });

  it('degrades to plain Linking (no result) when the native module is missing', async () => {
    const d = deps({});
    expect(await launchPayment(d, URI, 'com.phonepe.app')).toEqual({ kind: 'launched_without_result' });
    expect(d.openUrl).toHaveBeenCalledWith(URI);
  });

  it('reports no_app when Linking fails too', async () => {
    const d = deps({ openUrl: vi.fn().mockRejectedValue(new Error('nope')) });
    expect(await launchPayment(d, URI, null)).toEqual({ kind: 'no_app' });
  });

  it('maps launch outcomes to a UPI outcome', async () => {
    expect(outcomeOf({ kind: 'launched_without_result' })).toBe('unknown');
    expect(outcomeOf({ kind: 'no_app' })).toBe('unknown');
  });
});

describe('sortApps', () => {
  it('puts known apps first in preferred order, then the rest alphabetically', () => {
    const apps = [
      { packageName: 'z.app', name: 'Zed' },
      { packageName: 'com.google.android.apps.nbu.paisa.user', name: 'Google Pay' },
      { packageName: 'a.app', name: 'Alpha' },
      { packageName: 'com.phonepe.app', name: 'PhonePe' },
    ];
    const sorted = sortApps(apps, ['com.phonepe.app', 'com.google.android.apps.nbu.paisa.user']);
    expect(sorted.map((a) => a.name)).toEqual(['PhonePe', 'Google Pay', 'Alpha', 'Zed']);
  });
});
