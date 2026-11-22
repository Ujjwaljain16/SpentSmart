/**
 * Runs the 50-question eval against Gemini with your own key, exactly as the app calls it (phone-side tools,
 * payee names and notes hidden unless --share). Paced for free-tier limits, so a full run takes a few minutes.
 *
 *   $env:GEMINI_API_KEY = '...'                                            # PowerShell; never commit it
 *   pnpm --filter @spentsmart/assistant eval:gemini                       # all 50, default model
 *   pnpm --filter @spentsmart/assistant eval:gemini -- s1 t5 --share      # chosen ids, names allowed
 *   $env:GEMINI_MODEL = 'gemini-3.8-flash'                                # another model
 */
import { EVAL_NOW, fixtureLedger } from '../src/evals/fixture';
import { grade } from '../src/evals/grade';
import { EVAL_QUESTIONS } from '../src/evals/questions';
import { DEFAULT_GEMINI_MODEL, GeminiError, geminiConverse } from '../src/gemini';
import { ConversationResult } from '../src/loop';
import { firstUserMessage } from '../src/prompt';
import { runTool } from '../src/tools';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Set GEMINI_API_KEY first (a key from https://aistudio.google.com/apikey).');
  process.exit(1);
}
const model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
const shareDetails = process.argv.includes('--share');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const questions = ids.length > 0 ? EVAL_QUESTIONS.filter((q) => ids.includes(q.id)) : EVAL_QUESTIONS;
// Free keys allow only a few requests a minute; keep well under it.
const GAP_MS = Number(process.env.GEMINI_GAP_MS ?? 4500);

let calls = 0;
let last = 0;
const pacedFetch: Parameters<typeof geminiConverse>[0]['fetchImpl'] = async (url, init) => {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  calls++;
  return fetch(url, init);
};

console.log(`Model ${model}, ${shareDetails ? 'payee names and notes shared' : 'figures only'}, ${questions.length} questions\n`);
let passed = 0;
for (const q of questions) {
  const ledger = fixtureLedger();
  const expected = (await runTool(q.call.name, q.call.input, ledger, EVAL_NOW)).result;
  try {
    const run = await geminiConverse({
      apiKey,
      model,
      ledger,
      now: EVAL_NOW,
      contents: [{ role: 'user', parts: [{ text: firstUserMessage(q.question, new Date(EVAL_NOW)) }] }],
      shareDetails,
      fetchImpl: pacedFetch,
    });
    const asConversation = { ...run, messages: [], stopReason: run.finishReason } as unknown as ConversationResult;
    const g = grade(q, asConversation, expected);
    if (g.pass) passed++;
    console.log(`${g.pass ? 'PASS' : 'FAIL'} ${q.id.padEnd(4)} ${q.question}`);
    if (!g.pass) console.log(`     ${g.reasons.join('; ')}\n     reply: ${run.reply.replace(/\n/g, ' ')}`);
  } catch (error) {
    console.log(`ERROR ${q.id} ${error instanceof GeminiError ? `${error.kind}: ${error.message}` : String(error)}`);
    if (error instanceof GeminiError && error.kind === 'key') process.exit(1);
  }
}

console.log(`\n${passed}/${questions.length} passed, ${calls} Gemini calls`);
