import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { EVAL_NOW, fixtureLedger } from './evals/fixture';
import { grade, pick } from './evals/grade';
import { EVAL_QUESTIONS } from './evals/questions';
import { AssistantTransport, converse } from './loop';
import { runTool } from './tools';
import { statedAmounts, untracedAmounts } from './traceability';

type Block = Anthropic.Beta.BetaContentBlock;
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Block;
const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as unknown as Block;

/** A transport that replays scripted model turns and records what it was sent. */
function scripted(turns: { content: Block[]; stop_reason: string }[]) {
  const sent: Anthropic.Beta.BetaMessageParam[][] = [];
  const transport: AssistantTransport = {
    async turn(messages) {
      sent.push(structuredClone(messages));
      const next = turns.shift();
      if (!next) throw new Error('no more scripted turns');
      return next;
    },
  };
  return { transport, sent };
}

const ledger = fixtureLedger();
const start = (q: string) => [{ role: 'user' as const, content: q }];

describe('statedAmounts / untracedAmounts', () => {
  it('reads rupee amounts in the usual forms', () => {
    expect(statedAmounts('₹3,540 on Swiggy, Rs. 250, INR 1200, ₹1.2k and ₹2 lakh, ₹99.50').map((a) => a.paise)).toEqual([
      3_540_00, 250_00, 1_200_00, 1_200_00, 2_00_000_00, 99_50,
    ]);
  });

  it('allows human rounding but not invented figures', () => {
    const results = [{ spending: '₹23,538' }];
    expect(untracedAmounts('You spent ₹23,538 this month.', results)).toEqual([]);
    expect(untracedAmounts('About ₹23,500 so far.', results)).toEqual([]);
    expect(untracedAmounts('Roughly ₹24k.', results)).toEqual([]);
    expect(untracedAmounts('You spent ₹23,600.', results).map((a) => a.text)).toEqual(['₹23,600']);
    expect(untracedAmounts('That leaves ₹1,462.', results).map((a) => a.text)).toEqual(['₹1,462']);
  });
});

describe('converse', () => {
  it('runs tools on the phone side and returns the final answer', async () => {
    const { transport, sent } = scripted([
      { content: [text('Let me check.'), use('t1', 'get_summary', { period: 'this_month' })], stop_reason: 'tool_use' },
      { content: [text('You’ve spent ₹23,538 this month.')], stop_reason: 'end_turn' },
    ]);
    const r = await converse({ transport, ledger, now: EVAL_NOW, messages: start('How much this month?') });
    expect(r.reply).toBe('You’ve spent ₹23,538 this month.');
    expect(r.untraced).toEqual([]);
    expect(r.toolCalls.map((c) => c.name)).toEqual(['get_summary']);
    // The second request carries the model's own turn verbatim and the tool result.
    const second = sent[1]!;
    expect(second[1]).toEqual({ role: 'assistant', content: [text('Let me check.'), use('t1', 'get_summary', { period: 'this_month' })] });
    const results = second[2]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results[0]!.tool_use_id).toBe('t1');
    expect(JSON.parse(results[0]!.content as string).spending).toBe('₹23,538');
  });

  it('answers parallel tool calls in a single user message', async () => {
    const { transport, sent } = scripted([
      { content: [use('a', 'budget_status', {}), use('b', 'goals_status', {})], stop_reason: 'tool_use' },
      { content: [text('Done.')], stop_reason: 'end_turn' },
    ]);
    await converse({ transport, ledger, now: EVAL_NOW, messages: start('status?') });
    const results = sent[1]![2]!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(['a', 'b']);
  });

  it('marks tool errors so the model can correct itself', async () => {
    const { transport, sent } = scripted([
      { content: [use('a', 'can_i_afford', { amount_rupees: -1 })], stop_reason: 'tool_use' },
      { content: [text('Which amount?')], stop_reason: 'end_turn' },
    ]);
    await converse({ transport, ledger, now: EVAL_NOW, messages: start('afford?') });
    expect((sent[1]![2]!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]).toMatchObject({ is_error: true });
  });

  it('flags amounts the tools never returned', async () => {
    const { transport } = scripted([
      { content: [use('a', 'get_summary', { period: 'this_month' })], stop_reason: 'tool_use' },
      { content: [text('You spent ₹23,538, which is ₹4,000 more than usual.')], stop_reason: 'end_turn' },
    ]);
    const r = await converse({ transport, ledger, now: EVAL_NOW, messages: start('q') });
    expect(r.untraced.map((u) => u.text)).toEqual(['₹4,000']);
  });

  it('collects proposals and never saves anything itself', async () => {
    const { transport } = scripted([
      { content: [use('a', 'create_transaction', { amount_rupees: 250, type: 'expense', payee: 'Canteen', category: 'Food', date: null, note: null })], stop_reason: 'tool_use' },
      { content: [text('Confirm ₹250 at Canteen below.')], stop_reason: 'end_turn' },
    ]);
    const before = (await ledger.transactions(0, Number.MAX_SAFE_INTEGER)).length;
    const r = await converse({ transport, ledger, now: EVAL_NOW, messages: start('add 250 canteen') });
    expect(r.proposals).toEqual([expect.objectContaining({ kind: 'transaction', amountPaise: 25_000 })]);
    expect((await ledger.transactions(0, Number.MAX_SAFE_INTEGER)).length).toBe(before);
  });

  it('handles refusal, truncation and runaway loops', async () => {
    const refused = await converse({ transport: scripted([{ content: [], stop_reason: 'refusal' }]).transport, ledger, now: EVAL_NOW, messages: start('x') });
    expect(refused.reply).toMatch(/can’t help/);
    const cut = await converse({ transport: scripted([{ content: [text('You spent')], stop_reason: 'max_tokens' }]).transport, ledger, now: EVAL_NOW, messages: start('x') });
    expect(cut.reply).toMatch(/cut short/);
    const loop = Array.from({ length: 3 }, (_, i) => ({ content: [use(`u${i}`, 'budget_status', {})], stop_reason: 'tool_use' }));
    const runaway = await converse({ transport: scripted(loop).transport, ledger, now: EVAL_NOW, messages: start('x'), maxSteps: 3 });
    expect(runaway.reply).toMatch(/too many steps/);
  });
});

describe('eval set', () => {
  it('has 50 questions with unique ids', () => {
    expect(EVAL_QUESTIONS).toHaveLength(50);
    expect(new Set(EVAL_QUESTIONS.map((q) => q.id)).size).toBe(50);
  });

  it.each(EVAL_QUESTIONS.map((q) => [q.id, q] as const))('%s: canonical call works and every expected figure exists', async (_id, q) => {
    const out = await runTool(q.call.name, q.call.input, ledger, EVAL_NOW);
    expect(out.isError).toBeUndefined();
    for (const path of q.answer) {
      const v = pick(out.result, path);
      expect(typeof v, path).toBe('string');
      expect(statedAmounts(v as string), path).toHaveLength(1);
    }
  });

  it('a model that calls the right tool and quotes it passes every question', async () => {
    const failures: string[] = [];
    for (const q of EVAL_QUESTIONS) {
      const expected = (await runTool(q.call.name, q.call.input, ledger, EVAL_NOW)).result;
      const figures = q.answer.map((p) => pick(expected, p)).join(', ');
      const final = q.proposes ? `Please confirm it below: ${figures}.` : q.noFigures && q.tools.length === 0 ? 'I can’t see that in the app.' : `Here you go: ${figures || 'see above'}.`;
      const turns = q.tools.length === 0 ? [{ content: [text(final)], stop_reason: 'end_turn' }] : [
        { content: [use('c', q.call.name, q.call.input)], stop_reason: 'tool_use' },
        { content: [text(final)], stop_reason: 'end_turn' },
      ];
      const run = await converse({ transport: scripted(turns).transport, ledger, now: EVAL_NOW, messages: start(q.question) });
      const g = grade(q, run, expected);
      if (!g.pass) failures.push(`${q.id}: ${g.reasons.join('; ')}`);
    }
    expect(failures).toEqual([]);
  });

  it('the grader fails wrong tools, missing figures, invented figures and fake saves', async () => {
    const q = EVAL_QUESTIONS.find((x) => x.id === 's1')!;
    const expected = (await runTool(q.call.name, q.call.input, ledger, EVAL_NOW)).result;
    const runWith = async (turns: { content: Block[]; stop_reason: string }[]) => converse({ transport: scripted(turns).transport, ledger, now: EVAL_NOW, messages: start(q.question) });

    const wrongTool = await runWith([{ content: [use('a', 'budget_status', {})], stop_reason: 'tool_use' }, { content: [text('₹23,538')], stop_reason: 'end_turn' }]);
    expect(grade(q, wrongTool, expected).reasons.join()).toMatch(/expected one of get_summary/);

    const noFigure = await runWith([{ content: [use('a', 'get_summary', { period: 'this_month' })], stop_reason: 'tool_use' }, { content: [text('A fair amount.')], stop_reason: 'end_turn' }]);
    expect(grade(q, noFigure, expected).reasons.join()).toMatch(/missing ₹23,538/);

    const invented = await runWith([{ content: [use('a', 'get_summary', { period: 'this_month' })], stop_reason: 'tool_use' }, { content: [text('₹23,538, about ₹7,000 less than October.')], stop_reason: 'end_turn' }]);
    expect(grade(q, invented, expected).reasons.join()).toMatch(/untraceable amounts: ₹7,000/);

    const m = EVAL_QUESTIONS.find((x) => x.id === 'm1')!;
    const mExpected = (await runTool(m.call.name, m.call.input, ledger, EVAL_NOW)).result;
    const fakeSave = await converse({ transport: scripted([{ content: [text('Saved ₹250 for lunch.')], stop_reason: 'end_turn' }]).transport, ledger, now: EVAL_NOW, messages: start(m.question) });
    expect(grade(m, fakeSave, mExpected).reasons.join()).toMatch(/expected a transaction proposal/);
  });
});
