/**
 * Leaving the app on purpose (to pay in a UPI app, share an export, pick a contact) should not lock it on
 * return: the user never left SpentSmart's flow. A trip is announced right before leaving and covers exactly
 * one return, within a bounded window, so an abandoned trip cannot keep the lock off.
 */
export const MAX_TRIP_MS = 15 * 60 * 1000;

export function createTripGuard(now: () => number = Date.now) {
  let expectedUntil: number | null = null;

  return {
    expect(maxMs: number = MAX_TRIP_MS): void {
      expectedUntil = now() + Math.min(maxMs, MAX_TRIP_MS);
    },
    /** Call when the app becomes active again. True means this return was announced and the lock is skipped. */
    consumeOnReturn(): boolean {
      const until = expectedUntil;
      expectedUntil = null;
      return until !== null && now() <= until;
    },
    cancel(): void {
      expectedUntil = null;
    },
  };
}

const guard = createTripGuard();

export const expectExternalTrip = (maxMs?: number) => guard.expect(maxMs);
export const consumeExternalTrip = () => guard.consumeOnReturn();
export const cancelExternalTrip = () => guard.cancel();
