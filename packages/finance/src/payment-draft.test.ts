import { describe, expect, it } from 'vitest';
import { draftFromParams, draftFromParsed } from './payment-draft';
import { parseUpiUri } from './upi/parse';

describe('draftFromParams', () => {
  it('accepts a valid manual-entry payload', () => {
    expect(
      draftFromParams({ upiId: 'Friend@OkAxis', payeeName: ' Asha ', amount: '250.50', transactionNote: 'lunch', initialCategory: 'food' }),
    ).toEqual({
      vpa: 'friend@okaxis',
      payeeName: 'Asha',
      amountPaise: 25050,
      note: 'lunch',
      categoryKey: 'food',
      amountEditable: true,
    });
  });

  it('refuses links without a valid UPI ID (regression: placeholder unknown@upi)', () => {
    expect(draftFromParams({})).toBeNull();
    expect(draftFromParams({ upiId: '' })).toBeNull();
    expect(draftFromParams({ upiId: 'unknown' })).toBeNull();
  });

  it('refuses invalid amounts instead of guessing', () => {
    expect(draftFromParams({ upiId: 'a.b@ybl', amount: '-5' })).toBeNull();
    expect(draftFromParams({ upiId: 'a.b@ybl', amount: '1e9' })).toBeNull();
    expect(draftFromParams({ upiId: 'a.b@ybl', amount: 'abc' })).toBeNull();
  });

  it('allows an empty amount and falls back to the UPI ID as the name', () => {
    expect(draftFromParams({ upiId: 'a.b@ybl' })).toMatchObject({ amountPaise: undefined, payeeName: 'a.b@ybl' });
  });

  it('sanitises names and notes from hostile deep links', () => {
    const d = draftFromParams({ upiId: 'a.b@ybl', payeeName: 'Amazon‮\u0000', transactionNote: 'x'.repeat(500) });
    expect(d!.payeeName).toBe('Amazon');
    expect(d!.note).toHaveLength(80);
  });

  it('rejects odd category keys and takes the first of repeated params', () => {
    expect(draftFromParams({ upiId: 'a.b@ybl', initialCategory: "'; DROP" })!.categoryKey).toBe('food');
    expect(draftFromParams({ upiId: ['good@ybl', 'evil@ybl'] })!.vpa).toBe('good@ybl');
  });
});

describe('draftFromParsed', () => {
  it('locks the amount when the QR fixes it', () => {
    const r = parseUpiUri('upi://pay?pa=shop@okicici&pn=Shop&am=10.00');
    if (!r.ok) throw new Error('parse failed');
    const d = draftFromParsed(r.data);
    expect(d).toMatchObject({ vpa: 'shop@okicici', amountPaise: 1000, amountEditable: false });
    expect(d.source).toBe(r.data);
  });
});
