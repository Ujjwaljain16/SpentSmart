import { describe, expect, it } from 'vitest';
import { buildPayUri, buildPayUriWithoutAmount, generateTxnRef } from './build';
import { ParsedUpi, parseUpiUri, splitQuery } from './parse';
import {
  interpretLaunchResult,
  parseUpiResponse,
  RESULT_CANCELED,
  RESULT_OK,
  suggestionFor,
} from './response';
import { deriveNameFromVpa, isValidVpa, resolvePayeeName, sanitizeText } from './vpa';

function parsed(uri: string): ParsedUpi {
  const result = parseUpiUri(uri);
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.data;
}

describe('vpa helpers', () => {
  it('validates VPAs', () => {
    expect(isValidVpa('name@okhdfcbank')).toBe(true);
    expect(isValidVpa('first.last-1@ybl')).toBe(true);
    expect(isValidVpa('no-at-sign')).toBe(false);
    expect(isValidVpa('a@b')).toBe(false);
    expect(isValidVpa('bad space@ybl')).toBe(false);
    expect(isValidVpa('x@y@z')).toBe(false);
    expect(isValidVpa('')).toBe(false);
    expect(isValidVpa(undefined)).toBe(false);
  });

  it('derives names from VPAs', () => {
    expect(deriveNameFromVpa('nandini.milk@okaxis')).toBe('Nandini Milk');
    expect(deriveNameFromVpa('9876543210@ybl')).toBeNull();
  });

  it('resolves payee names', () => {
    expect(resolvePayeeName('Cafe Coffee Day', 'ccd@icici')).toBe('Cafe Coffee Day');
    expect(resolvePayeeName('Google Merchant', 'nandini.milk@okaxis')).toBe('Nandini Milk');
    expect(resolvePayeeName(undefined, '123456@ybl')).toBe('Unknown payee');
    expect(resolvePayeeName('Raj Store', 'raj@ybl')).toBe('Raj Store');
    expect(resolvePayeeName('fake@upi', 'real.person@ybl')).toBe('Real Person');
  });

  it('strips control and bidi characters', () => {
    expect(sanitizeText('a‮b\u0000c   d', 20)).toBe('a b c d');
    expect(sanitizeText('x'.repeat(100), 10)).toHaveLength(10);
  });
});

describe('splitQuery', () => {
  it('splits on the first "=" only, keeping padding and embedded "="', () => {
    expect(splitQuery('sign=AbC123xyz==&tn=a=b')).toEqual([
      ['sign', 'AbC123xyz=='],
      ['tn', 'a=b'],
    ]);
  });
});

describe('parseUpiUri', () => {
  it('parses a basic P2P QR', () => {
    const p = parsed('upi://pay?pa=friend@okaxis&pn=My%20Friend&am=125.50&cu=INR&tn=lunch');
    expect(p).toMatchObject({
      vpa: 'friend@okaxis',
      payeeName: 'My Friend',
      amountPaise: 12550,
      note: 'lunch',
      isMerchant: false,
      isSigned: false,
      amountEditable: false,
    });
  });

  it('accepts scheme variants and leading whitespace', () => {
    expect(parseUpiUri(' UPI://pay?pa=a.b@ybl').ok).toBe(true);
    expect(parseUpiUri('upi:pay?pa=a.b@ybl').ok).toBe(true);
  });

  it('keeps signature values intact (regression: values containing "=")', () => {
    const p = parsed('upi://pay?pa=shop@okicici&pn=Shop&mc=5411&tr=T123&sign=AbC123xyz==&tn=a=b');
    expect(p.params.sign).toBe('AbC123xyz==');
    expect(p.params.tn).toBe('a=b');
    expect(p.isSigned).toBe(true);
    expect(p.isMerchant).toBe(true);
    expect(p.rawQuery).toContain('sign=AbC123xyz==');
  });

  it('treats + as a space and survives malformed escapes', () => {
    expect(parsed('upi://pay?pa=a.b@ybl&pn=Big+Shop').payeeName).toBe('Big Shop');
    expect(parsed('upi://pay?pa=a.b@ybl&pn=100%').payeeName).toBe('100%');
  });

  it('ignores duplicate params after the first (parameter pollution)', () => {
    const p = parsed('upi://pay?pa=good@ybl&pa=evil@ybl');
    expect(p.vpa).toBe('good@ybl');
  });

  it('marks amount editable when there is no fixed amount or mam is present', () => {
    expect(parsed('upi://pay?pa=a.b@ybl').amountEditable).toBe(true);
    expect(parsed('upi://pay?pa=a.b@ybl&am=10&mam=5').amountEditable).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['hello world', 'not_upi'],
    ['00020101021226...EMV', 'not_upi'],
    ['https://example.com/pay?pa=a@ybl', 'not_upi'],
    ['upi://pay?pn=NoVpa', 'missing_payee'],
    ['upi://pay?pa=not-a-vpa', 'invalid_payee'],
    ['upi://pay?pa=a.b@ybl&am=-5', 'invalid_amount'],
    ['upi://pay?pa=a.b@ybl&am=1e9', 'invalid_amount'],
    ['upi://pay?pa=a.b@ybl&am=abc', 'invalid_amount'],
    ['upi://pay?pa=a.b@ybl&cu=USD', 'unsupported_currency'],
  ])('rejects %j (%s)', (input, reason) => {
    expect(parseUpiUri(input)).toEqual({ ok: false, reason });
  });

  it('rejects oversized payloads', () => {
    expect(parseUpiUri('upi://pay?pa=a.b@ybl&tn=' + 'x'.repeat(3000))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });
});

describe('buildPayUri', () => {
  const base = { vpa: 'friend@okaxis', payeeName: 'My Friend' };

  it('builds a clean P2P URI with a reference and encoded fields', () => {
    const uri = buildPayUri({ ...base, amountPaise: 12550, note: 'lunch & tea', txnRef: 'SS123' });
    expect(uri).toBe('upi://pay?pa=friend%40okaxis&pn=My%20Friend&am=125.50&cu=INR&tn=lunch%20%26%20tea&tr=SS123');
  });

  it('omits the amount when not supplied', () => {
    expect(buildPayUri(base)).toBe('upi://pay?pa=friend%40okaxis&pn=My%20Friend&cu=INR');
  });

  it('never lets a note inject parameters', () => {
    const uri = buildPayUri({ ...base, amountPaise: 100, note: 'x&am=999999' });
    expect(uri).not.toContain('&am=999999');
    expect(uri.match(/am=/g)).toHaveLength(1);
  });

  it('replays signed QRs byte for byte, ignoring edits', () => {
    const source = parsed('upi://pay?pa=shop@okicici&pn=Shop&am=10.00&sign=AbC==&orgid=1');
    const uri = buildPayUri({ ...base, amountPaise: 99999, source });
    expect(uri).toBe('upi://pay?pa=shop@okicici&pn=Shop&am=10.00&sign=AbC==&orgid=1');
    expect(buildPayUriWithoutAmount({ ...base, source })).toBe(uri);
  });

  it('replays unsigned merchant QRs and fills in a missing amount', () => {
    const source = parsed('upi://pay?pa=shop@okicici&pn=Shop&mc=5411&tr=ORD1');
    expect(buildPayUri({ ...base, amountPaise: 2500, source })).toBe(
      'upi://pay?pa=shop@okicici&pn=Shop&mc=5411&tr=ORD1&am=25.00&cu=INR',
    );
  });

  it('does not override a fixed amount on unsigned merchant QRs', () => {
    const source = parsed('upi://pay?pa=shop@okicici&pn=Shop&mc=5411&tr=ORD1&am=10.00&cu=INR');
    expect(buildPayUri({ ...base, amountPaise: 99900, source })).toBe(`upi://pay?${source.rawQuery}`);
  });

  it('turns pseudo-merchant QRs on personal VPAs into clean P2P URIs', () => {
    const source = parsed('upi://pay?pa=friend@okaxis&pn=Friend&mc=0000&mode=02&purpose=00');
    expect(source.isMerchant).toBe(false);
    const uri = buildPayUri({ ...base, amountPaise: 100, source });
    expect(uri).not.toMatch(/mc=|mode=|purpose=/);
  });

  it('builds the no-amount fallback', () => {
    const uri = buildPayUriWithoutAmount({ ...base, amountPaise: 100, txnRef: 'SS1' });
    expect(uri).toBe('upi://pay?pa=friend%40okaxis&pn=My%20Friend&cu=INR&tr=SS1');
  });
});

describe('generateTxnRef', () => {
  it('is alphanumeric, bounded and deterministic given inputs', () => {
    const ref = generateTxnRef(1_700_000_000_000, () => 0.5);
    expect(ref).toMatch(/^[A-Z0-9]{1,35}$/);
    expect(ref).toBe(generateTxnRef(1_700_000_000_000, () => 0.5));
    expect(generateTxnRef(1, () => 0.1)).not.toBe(generateTxnRef(1, () => 0.9));
  });
});

describe('parseUpiResponse', () => {
  it.each([
    ['txnId=A1&responseCode=00&Status=SUCCESS&txnRef=R1', 'success'],
    ['Status=success', 'success'],
    ['txnId=A1&responseCode=ZD&Status=FAILURE', 'failure'],
    ['Status=FAILED', 'failure'],
    ['Status=SUBMITTED&txnId=X', 'submitted'],
    ['Status=Pending', 'submitted'],
    ['responseCode=00', 'success'],
    ['responseCode=U30', 'failure'],
    ['response=garbage', 'unknown'],
    ['', 'unknown'],
    ['nonsense', 'unknown'],
  ])('%j -> %s', (raw, outcome) => {
    expect(parseUpiResponse(raw).outcome).toBe(outcome);
  });

  it('extracts identifiers with case-insensitive keys', () => {
    expect(parseUpiResponse('TXNID=T1&TxnRef=R1&responsecode=00&ApprovalRefNo=123')).toMatchObject({
      txnId: 'T1',
      txnRef: 'R1',
      responseCode: '00',
      approvalRef: '123',
      outcome: 'success',
    });
  });

  it('handles null/undefined', () => {
    expect(parseUpiResponse(null).outcome).toBe('unknown');
    expect(parseUpiResponse(undefined).outcome).toBe('unknown');
  });
});

describe('interpretLaunchResult', () => {
  it('prefers the payload', () => {
    expect(interpretLaunchResult({ resultCode: RESULT_OK, response: 'Status=SUCCESS' }).outcome).toBe('success');
    expect(interpretLaunchResult({ resultCode: RESULT_CANCELED, response: 'Status=FAILURE' }).outcome).toBe('failure');
  });

  it('maps an empty cancelled result to cancelled and an empty OK result to unknown', () => {
    expect(interpretLaunchResult({ resultCode: RESULT_CANCELED, response: null }).outcome).toBe('cancelled');
    expect(interpretLaunchResult({ resultCode: RESULT_OK, response: null }).outcome).toBe('unknown');
  });
});

describe('suggestionFor', () => {
  it('only suggests "paid" on a clear success', () => {
    expect(suggestionFor('success')).toBe('paid');
    expect(suggestionFor('failure')).toBe('not_paid');
    expect(suggestionFor('cancelled')).toBe('not_paid');
    expect(suggestionFor('submitted')).toBe('unsure');
    expect(suggestionFor('unknown')).toBe('unsure');
  });
});
