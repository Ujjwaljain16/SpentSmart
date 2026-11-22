import { LedgerSource } from './ledger';
import { ToolCallRecord } from './loop';
import { MINIMISED_NOTE, minimiseToolResult } from './privacy';
import { SYSTEM_PROMPT } from './prompt';
import { MUTATING_TOOLS, Proposal, TOOL_DEFINITIONS, ToolOutcome, runTool } from './tools';
import { StatedAmount, untracedAmounts } from './traceability';

/**
 * Bring-your-own-key assistant on Google's Gemini API. The phone calls Google directly with the user's key: no
 * SpentSmart server in between, nothing stored anywhere but the phone. The same tools run on the phone as for the
 * server-backed assistant; only their results go to the model, minimised unless the user allows details.
 */

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

/** Stable models on Gemini's free tier (Google's model and pricing pages, Nov 2026). The first is the default. */
export const GEMINI_MODELS = [
  // Each runs at the least thinking it allows: the tools do the arithmetic, and default thinking made answers slow.
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Fastest, highest free limits', thinkingLevel: 'minimal' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Balanced', thinkingLevel: 'minimal' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Smartest free model, lowest free limits', thinkingLevel: 'low' },
] as const;
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0].id;

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: 'key' | 'quota' | 'model' | 'busy' | 'blocked' | 'network' | 'other',
  ) {
    super(message);
  }
}

/** Gemini accepts an OpenAPI-style subset of JSON Schema: drop the keywords it doesn't know. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === 'additionalProperties') continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, s]) => [p, toGeminiSchema(s)])) : toGeminiSchema(v);
  }
  // An object with no properties is clearer to the API as "no parameters".
  if (out.type === 'object' && out.properties && Object.keys(out.properties as object).length === 0) return undefined;
  return out;
}

export const GEMINI_TOOLS = [
  {
    functionDeclarations: TOOL_DEFINITIONS.map((t) => {
      const parameters = toGeminiSchema(t.input_schema);
      return { name: t.name, description: t.description, ...(parameters ? { parameters } : {}) };
    }),
  },
];

function errorFor(status: number, body: unknown): GeminiError {
  const message = (body as { error?: { message?: string; status?: string } })?.error;
  const detail = message?.message ?? '';
  if (status === 400 && /api key/i.test(detail)) return new GeminiError('That Gemini API key isn’t valid. Check it in Settings → Assistant.', 'key');
  if (status === 401 || status === 403) return new GeminiError('Google refused the Gemini API key. Check it in Settings → Assistant.', 'key');
  if (status === 404) return new GeminiError('That Gemini model isn’t available to your key. Pick another in Settings → Assistant.', 'model');
  if (status === 429) return new GeminiError('Your Gemini key hit its rate limit. Wait a minute (free keys also have a daily cap) and try again.', 'quota');
  if (status === 500 || status === 503) return new GeminiError('Gemini is overloaded right now (that’s on Google’s side). Try again in a minute, or pick another model in Settings → Assistant.', 'busy');
  return new GeminiError(`Gemini didn’t answer (${status}${detail ? `: ${detail.slice(0, 120)}` : ''}).`, 'other');
}

/** Waits before each retry of an overloaded model. Free-tier 503s usually clear within a few seconds. */
const RETRY_DELAYS_MS = [1000, 2500, 5000];

async function generate(opts: { apiKey: string; model: string; contents: GeminiContent[]; system: string; fetchImpl: Fetch; sleep: Sleep }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateOnce(opts);
    } catch (e) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (!(e instanceof GeminiError) || e.kind !== 'busy' || delay === undefined) throw e;
      await opts.sleep(delay);
    }
  }
}

async function generateOnce(opts: { apiKey: string; model: string; contents: GeminiContent[]; system: string; fetchImpl: Fetch }) {
  const thinkingLevel = GEMINI_MODELS.find((m) => m.id === opts.model)?.thinkingLevel;
  let res: Awaited<ReturnType<Fetch>>;
  try {
    res = await opts.fetchImpl(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(opts.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.contents,
        tools: GEMINI_TOOLS,
        generationConfig: { temperature: 0.2, ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}) },
      }),
    });
  } catch {
    throw new GeminiError('Can’t reach Gemini. Check your connection.', 'network');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw errorFor(res.status, body);
  const candidate = (body as { candidates?: { content?: GeminiContent; finishReason?: string }[]; promptFeedback?: { blockReason?: string } })?.candidates?.[0];
  if (!candidate?.content) {
    const blocked = (body as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason;
    throw new GeminiError(blocked ? 'Gemini declined to answer that one.' : 'Gemini sent an empty answer. Try again.', blocked ? 'blocked' : 'other');
  }
  return { content: { role: 'model' as const, parts: candidate.content.parts ?? [] }, finishReason: candidate.finishReason ?? null };
}

export interface GeminiResult {
  /** The full history to continue with; model turns kept verbatim (thought signatures must go back unchanged). */
  contents: GeminiContent[];
  reply: string;
  toolCalls: ToolCallRecord[];
  proposals: Proposal[];
  finishReason: string | null;
  untraced: StatedAmount[];
}

const MAX_STEPS = 8;

export async function geminiConverse(opts: {
  apiKey: string;
  model: string;
  ledger: LedgerSource;
  now: number;
  contents: GeminiContent[];
  /** Send payee names and notes too. Off by default. */
  shareDetails: boolean;
  fetchImpl: Fetch;
  maxSteps?: number;
  sleep?: Sleep;
}): Promise<GeminiResult> {
  const contents = [...opts.contents];
  const system = opts.shareDetails ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n- ${MINIMISED_NOTE}`;
  const toolCalls: ToolCallRecord[] = [];
  const proposals: Proposal[] = [];
  let reply = '';
  let finishReason: string | null = null;
  let pendingTools = false;

  for (let step = 0; step < (opts.maxSteps ?? MAX_STEPS); step++) {
    const turn = await generate({ apiKey: opts.apiKey, model: opts.model, contents, system, fetchImpl: opts.fetchImpl, sleep: opts.sleep ?? realSleep });
    finishReason = turn.finishReason;
    contents.push(turn.content);

    const calls = turn.content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (calls.length === 0) {
      reply = turn.content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim();
      if (finishReason === 'MAX_TOKENS') reply += reply ? '\n\n(The answer was cut short.)' : 'The answer was cut short. Try a narrower question.';
      pendingTools = false;
      break;
    }

    pendingTools = true;
    const responses = await Promise.all(
      calls.map(async (call) => {
        let outcome: ToolOutcome;
        try {
          outcome = await runTool(call.name, call.args ?? {}, opts.ledger, opts.now);
        } catch {
          outcome = { result: { error: 'The tool failed. Try a different question.' }, isError: true };
        }
        toolCalls.push({ name: call.name, input: call.args ?? {}, outcome });
        if (outcome.proposal) proposals.push(outcome.proposal);
        // Proposals echo what the user asked to record, so they go back as they are.
        const sent = opts.shareDetails || MUTATING_TOOLS.has(call.name) ? outcome.result : minimiseToolResult(outcome.result);
        return { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: { result: sent } } };
      }),
    );
    contents.push({ role: 'user', parts: responses });
  }

  if (!reply && pendingTools) reply = 'That took too many steps. Try asking something more specific.';
  return { contents, reply, toolCalls, proposals, finishReason, untraced: untracedAmounts(reply, toolCalls.map((c) => c.outcome.result)) };
}

/** A cheap call that proves the key works for the chosen model (lists the model; no tokens spent). */
export async function checkGeminiKey(apiKey: string, model: string, fetchImpl: Fetch): Promise<void> {
  let res: Awaited<ReturnType<Fetch>>;
  try {
    res = await fetchImpl(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(model)}`, { method: 'GET', headers: { 'x-goog-api-key': apiKey } });
  } catch {
    throw new GeminiError('Can’t reach Gemini. Check your connection.', 'network');
  }
  if (!res.ok) throw errorFor(res.status, await res.json().catch(() => null));
}
