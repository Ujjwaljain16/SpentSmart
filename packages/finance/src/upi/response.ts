/**
 * Interpretation of the response a UPI app returns to the calling app (NPCI UPI linking spec):
 * `txnId=...&responseCode=00&Status=SUCCESS&txnRef=...` delivered as the "response" intent extra.
 *
 * The response is a *signal*, not proof: apps differ in what they return (some return nothing, some return
 * SUBMITTED), and without a server there is no way to verify it independently. Callers must treat
 * anything other than a clear SUCCESS/FAILURE as "unsure" and ask the user.
 */
export type UpiOutcome = 'success' | 'failure' | 'submitted' | 'cancelled' | 'unknown';

export interface UpiResponse {
  outcome: UpiOutcome;
  txnId?: string;
  txnRef?: string;
  responseCode?: string;
  approvalRef?: string;
  raw?: string;
}

const SUCCESS = new Set(['success', 'successful', 'succeeded', 'completed', 'ok']);
const FAILURE = new Set(['failure', 'failed', 'fail', 'declined', 'rejected', 'error']);
const SUBMITTED = new Set(['submitted', 'pending', 'processing', 'initiated', 'inprogress', 'in_progress']);

function parseKeyValues(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      /* keep raw value */
    }
    if (!(key in out)) out[key] = value;
  }
  return out;
}

export function parseUpiResponse(raw: string | null | undefined): UpiResponse {
  if (!raw || !raw.trim()) return { outcome: 'unknown' };
  const kv = parseKeyValues(raw.trim());

  const status = (kv.status ?? kv.response ?? '').toLowerCase();
  const code = kv.responsecode;
  let outcome: UpiOutcome = 'unknown';

  if (SUCCESS.has(status)) outcome = 'success';
  else if (FAILURE.has(status)) outcome = 'failure';
  else if (SUBMITTED.has(status)) outcome = 'submitted';
  else if (code !== undefined && code !== '') outcome = code === '00' ? 'success' : 'failure';

  return {
    outcome,
    txnId: kv.txnid || undefined,
    txnRef: kv.txnref || undefined,
    responseCode: code || undefined,
    approvalRef: kv.approvalrefno || undefined,
    raw: raw.trim(),
  };
}

/** Android Activity result codes as delivered by the native module. */
export const RESULT_OK = -1;
export const RESULT_CANCELED = 0;

export interface RawLaunchResult {
  resultCode: number;
  response: string | null;
}

/** Combine the activity result code with the parsed payload into one outcome. */
export function interpretLaunchResult(result: RawLaunchResult): UpiResponse {
  const parsed = parseUpiResponse(result.response);
  if (parsed.outcome !== 'unknown') return parsed;
  if (result.resultCode === RESULT_CANCELED) return { ...parsed, outcome: 'cancelled' };
  return parsed;
}

export type PaymentSuggestion = 'paid' | 'not_paid' | 'unsure';

/** What to pre-select for the user when we ask "did this go through?". */
export function suggestionFor(outcome: UpiOutcome): PaymentSuggestion {
  switch (outcome) {
    case 'success':
      return 'paid';
    case 'failure':
    case 'cancelled':
      return 'not_paid';
    default:
      return 'unsure';
  }
}
