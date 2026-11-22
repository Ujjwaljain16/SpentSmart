import { describe, expect, it } from 'vitest';
import { MAX_TRIP_MS, createTripGuard } from './external-trip';

describe('trip guard', () => {
  it('skips the lock for one announced return only', () => {
    let t = 0;
    const g = createTripGuard(() => t);
    g.expect();
    t += 60_000;
    expect(g.consumeOnReturn()).toBe(true);
    expect(g.consumeOnReturn()).toBe(false);
  });

  it('does not skip without an announcement', () => {
    expect(createTripGuard(() => 0).consumeOnReturn()).toBe(false);
  });

  it('expires, and never allows more than the maximum window', () => {
    let t = 0;
    const g = createTripGuard(() => t);
    g.expect(10 * MAX_TRIP_MS);
    t = MAX_TRIP_MS + 1;
    expect(g.consumeOnReturn()).toBe(false);
  });

  it('can be cancelled when the trip never happened', () => {
    const g = createTripGuard(() => 0);
    g.expect();
    g.cancel();
    expect(g.consumeOnReturn()).toBe(false);
  });
});
