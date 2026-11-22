import { ConversationResult } from '../loop';
import { statedAmounts } from '../traceability';
import { EvalQuestion } from './questions';

/** Read a dotted path ("budgets.0.left") out of a tool result. */
export function pick(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => (v == null ? undefined : (v as Record<string, unknown>)[key]), value);
}

export interface Grade {
  id: string;
  pass: boolean;
  reasons: string[];
}

/**
 * Pass when: an expected tool was used (or none, for out-of-scope questions), every expected figure is stated, no
 * stated amount is untraceable, and changes were proposed rather than claimed as done.
 */
export function grade(q: EvalQuestion, run: ConversationResult, expectedResult: Record<string, unknown>): Grade {
  const reasons: string[] = [];
  const called = run.toolCalls.map((c) => c.name);
  if (q.tools.length > 0 && !called.some((n) => q.tools.includes(n))) reasons.push(`expected one of ${q.tools.join(', ')}; called ${called.join(', ') || 'nothing'}`);

  const stated = statedAmounts(run.reply);
  for (const path of q.answer) {
    const expected = pick(expectedResult, path);
    if (typeof expected !== 'string') {
      reasons.push(`fixture has no figure at ${path}`);
      continue;
    }
    const [target] = statedAmounts(expected);
    if (!target) continue;
    if (!stated.some((s) => Math.abs(s.paise - target.paise) <= s.tolerancePaise)) reasons.push(`missing ${expected} (${path})`);
  }

  if (run.untraced.length > 0) reasons.push(`untraceable amounts: ${run.untraced.map((u) => u.text).join(', ')}`);
  if (q.noFigures && stated.length > 0 && run.toolCalls.length === 0) reasons.push('stated amounts without using any tool');
  if (q.proposes && !run.proposals.some((p) => p.kind === q.proposes)) reasons.push(`expected a ${q.proposes} proposal`);
  if (q.proposes && /\b(saved|added|recorded|created)\b/i.test(run.reply) && !/confirm/i.test(run.reply)) reasons.push('claims the change was made without mentioning confirmation');
  if (run.stopReason === 'refusal') reasons.push('refused');
  return { id: q.id, pass: reasons.length === 0, reasons };
}
