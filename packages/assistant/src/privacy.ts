/**
 * What leaves the phone when the user brings their own model key. On a free Gemini key Google may use prompts to
 * improve its products and people may review them, so by default the model gets figures only: payee names and notes
 * in tool results are hidden. Totals, categories, dates and amounts are enough for nearly every question.
 *
 * Text the user types themselves (the question, a payee they ask to record) is theirs to send and isn't touched.
 */
export const HIDDEN = '(hidden)';

const DETAIL_KEYS = new Set(['payee', 'note']);

export function minimiseToolResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(minimiseToolResult);
  if (result && typeof result === 'object') {
    return Object.fromEntries(
      Object.entries(result as Record<string, unknown>).map(([key, value]) => {
        if (DETAIL_KEYS.has(key)) return [key, value == null ? value : HIDDEN];
        return [key, minimiseToolResult(value)];
      }),
    );
  }
  return result;
}

/** Added to the instructions when details are hidden, so the model explains instead of guessing names. */
export const MINIMISED_NOTE =
  'Payee names and notes in tool results are hidden by the user\'s privacy setting and show as "(hidden)". Answer with categories, dates and amounts; if the user needs a payee name, say it is hidden and that they can allow names in Settings → Assistant.';
