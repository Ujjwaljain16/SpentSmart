import { describe, expect, it } from 'vitest';
import { EVAL_NOW, fixtureLedger } from './evals/fixture';
import { GEMINI_TOOLS, GeminiContent, GeminiError, checkGeminiKey, geminiConverse } from './gemini';
import { HIDDEN, minimiseToolResult } from './privacy';

type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown> | null };

/** A fetch that replays scripted Gemini responses and records each request. */
function fakeGemini(responses: { status?: number; body: unknown }[]) {
  const sent: Sent[] = [];
  const fetchImpl = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    sent.push({ url, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (!next) throw new Error('no more scripted responses');
    return { ok: (next.status ?? 200) < 400, status: next.status ?? 200, json: async () => next.body };
  };
  return { fetchImpl, sent };
}

const model = (parts: unknown[], finishReason = 'STOP') => ({ body: { candidates: [{ content: { role: 'model', parts }, finishReason }] } });
const ask = (q: string): GeminiContent[] => [{ role: 'user', parts: [{ text: q }] }];
const ledger = fixtureLedger();
const base = { apiKey: 'test-key', model: 'gemini-3.5-flash-lite', ledger, now: EVAL_NOW };
const sleep = async () => {};

describe('Gemini tool declarations', () => {
  it('declares every tool without JSON-schema keywords Gemini rejects', () => {
    const decls = GEMINI_TOOLS[0]!.functionDeclarations;
    expect(decls.map((d) => d.name)).toContain('search_transactions');
    expect(JSON.stringify(decls)).not.toContain('additionalProperties');
    // Tools that take nothing are declared without parameters.
    expect(decls.find((d) => d.name === 'budget_status')).not.toHaveProperty('parameters');
  });
});

describe('geminiConverse', () => {
  it('sends the key in a header, never the URL, and returns the text answer', async () => {
    const { fetchImpl, sent } = fakeGemini([model([{ text: 'Hi.' }])]);
    const result = await geminiConverse({ ...base, contents: ask('hello'), shareDetails: false, fetchImpl });
    expect(result.reply).toBe('Hi.');
    expect(sent[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(sent[0]!.url).not.toContain('test-key');
    expect(sent[0]!.headers['x-goog-api-key']).toBe('test-key');
    expect(sent[0]!.body).toMatchObject({ tools: GEMINI_TOOLS, contents: ask('hello') });
  });

  it('runs a requested tool on the phone and sends back only its result, then answers from it', async () => {
    const { fetchImpl, sent } = fakeGemini([
      model([{ functionCall: { name: 'get_summary', args: { period: 'this_month' }, id: 'c1' }, thoughtSignature: 'sig' }]),
      model([{ text: 'You spent less than last month.' }]),
    ]);
    const result = await geminiConverse({ ...base, contents: ask('How much this month?'), shareDetails: false, fetchImpl });
    expect(result.toolCalls.map((c) => c.name)).toEqual(['get_summary']);
    const second = sent[1]!.body!.contents as GeminiContent[];
    // The model turn goes back verbatim (thought signatures intact), followed by the tool result.
    expect(second[1]).toEqual({ role: 'model', parts: [{ functionCall: { name: 'get_summary', args: { period: 'this_month' }, id: 'c1' }, thoughtSignature: 'sig' }] });
    expect(second[2]!.parts[0]!.functionResponse).toMatchObject({ name: 'get_summary', id: 'c1' });
    expect(result.reply).toBe('You spent less than last month.');
  });

  it('hides payee names and notes from search results unless the user allows them', async () => {
    const call = model([{ functionCall: { name: 'search_transactions', args: { text: 'swiggy', period: 'this_year' } } }]);
    const hidden = fakeGemini([structuredClone(call), model([{ text: 'ok' }])]);
    await geminiConverse({ ...base, contents: ask('swiggy?'), shareDetails: false, fetchImpl: hidden.fetchImpl });
    const sentHidden = JSON.stringify(hidden.sent[1]!.body!.contents);
    expect(sentHidden).toContain(HIDDEN);
    expect(sentHidden).not.toMatch(/"payee":"(?!\(hidden\))/);
    expect(String(hidden.sent[1]!.body!.systemInstruction && JSON.stringify(hidden.sent[1]!.body!.systemInstruction))).toContain('hidden');

    const shown = fakeGemini([structuredClone(call), model([{ text: 'ok' }])]);
    await geminiConverse({ ...base, contents: ask('swiggy?'), shareDetails: true, fetchImpl: shown.fetchImpl });
    expect(JSON.stringify(shown.sent[1]!.body!.contents)).not.toContain(HIDDEN);
  });

  it('keeps proposals as proposals: nothing is saved, and the model sees what it asked for', async () => {
    const { fetchImpl, sent } = fakeGemini([
      model([{ functionCall: { name: 'create_transaction', args: { amount_rupees: 340, payee: 'Swiggy', type: 'expense' } } }]),
      model([{ text: 'Confirm it below.' }]),
    ]);
    const result = await geminiConverse({ ...base, contents: ask('add 340 swiggy'), shareDetails: false, fetchImpl });
    expect(result.proposals).toHaveLength(1);
    expect(JSON.stringify(sent[1]!.body!.contents)).toContain('Swiggy');
  });

  it('ignores thought parts in the reply and flags amounts no tool returned', async () => {
    const { fetchImpl } = fakeGemini([model([{ text: 'thinking about ₹9,999', thought: true }, { text: 'You spent ₹1,23,456.' }])]);
    const result = await geminiConverse({ ...base, contents: ask('x'), shareDetails: false, fetchImpl });
    expect(result.reply).toBe('You spent ₹1,23,456.');
    expect(result.untraced.map((u) => u.text)).toEqual(['₹1,23,456']);
  });

  it('stops after the step limit instead of looping forever', async () => {
    const loop = model([{ functionCall: { name: 'budget_status', args: {} } }]);
    const { fetchImpl } = fakeGemini([1, 2, 3].map(() => structuredClone(loop)));
    const result = await geminiConverse({ ...base, contents: ask('x'), shareDetails: false, fetchImpl, maxSteps: 3 });
    expect(result.reply).toMatch(/too many steps/);
  });

  it.each([
    [400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, 'key'],
    [403, { error: { message: 'Permission denied' } }, 'key'],
    [404, { error: { message: 'models/x is not found' } }, 'model'],
    [429, { error: { message: 'Resource exhausted' } }, 'quota'],
    [500, { error: { message: 'Internal' } }, 'busy'],
    [503, { error: { message: 'The model is overloaded. Please try again later.' } }, 'busy'],
  ])('turns HTTP %i into a clear error', async (status, body, kind) => {
    const { fetchImpl } = fakeGemini([1, 2, 3, 4].map(() => ({ status, body })));
    const err = await geminiConverse({ ...base, contents: ask('x'), shareDetails: false, fetchImpl, sleep }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as GeminiError).kind).toBe(kind);
  });

  it('retries an overloaded model before giving up', async () => {
    const busy = { status: 503, body: { error: { message: 'The model is overloaded.' } } };
    const waits: number[] = [];
    const { fetchImpl, sent } = fakeGemini([busy, busy, model([{ text: 'Done.' }])]);
    const res = await geminiConverse({ ...base, contents: ask('x'), shareDetails: false, fetchImpl, sleep: async (ms) => void waits.push(ms) });
    expect(res.reply).toBe('Done.');
    expect(sent).toHaveLength(3);
    expect(waits).toEqual([1000, 2500]);
  });

  it('asks each model for the least thinking it allows, so answers come quickly', async () => {
    for (const [id, level] of [['gemini-3.5-flash-lite', 'minimal'], ['gemini-3.6-flash', 'minimal'], ['gemini-3.8-flash', 'low']]) {
      const { fetchImpl, sent } = fakeGemini([model([{ text: 'ok' }])]);
      await geminiConverse({ ...base, model: id!, contents: ask('x'), shareDetails: false, fetchImpl });
      expect(sent[0]!.body).toMatchObject({ generationConfig: { thinkingConfig: { thinkingLevel: level } } });
    }
  });

  it('reports a blocked prompt plainly', async () => {
    const { fetchImpl } = fakeGemini([{ body: { promptFeedback: { blockReason: 'SAFETY' } } }]);
    await expect(geminiConverse({ ...base, contents: ask('x'), shareDetails: false, fetchImpl })).rejects.toMatchObject({ kind: 'blocked' });
  });
});

describe('checkGeminiKey', () => {
  it('asks for the model with the key in a header', async () => {
    const { fetchImpl, sent } = fakeGemini([{ body: { name: 'models/gemini-3.5-flash-lite' } }]);
    await checkGeminiKey('k', 'gemini-3.5-flash-lite', fetchImpl);
    expect(sent[0]).toMatchObject({ url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite', headers: { 'x-goog-api-key': 'k' } });
  });
});

describe('minimiseToolResult', () => {
  it('hides payee and note anywhere in a result and leaves figures alone', () => {
    expect(
      minimiseToolResult({ total: '₹500', transactions: [{ payee: 'Swiggy', note: 'dinner', amount: '₹500', category: 'Food' }], bills: [{ payee: 'Netflix', note: null }] }),
    ).toEqual({ total: '₹500', transactions: [{ payee: HIDDEN, note: HIDDEN, amount: '₹500', category: 'Food' }], bills: [{ payee: HIDDEN, note: null }] });
  });
});
