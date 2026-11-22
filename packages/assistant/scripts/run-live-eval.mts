/**
 * Runs the 50-question eval against the real model, with the same request the API sends. Costs real money: each
 * question is one to three model calls. Needs Anthropic credentials (ANTHROPIC_API_KEY or an `ant auth login` profile).
 *
 *   pnpm --filter @spentsmart/assistant eval:live              # all 50
 *   pnpm --filter @spentsmart/assistant eval:live -- s1 t5    # chosen ids
 */
import Anthropic from '@anthropic-ai/sdk';
import { EVAL_NOW, fixtureLedger } from '../src/evals/fixture';
import { grade } from '../src/evals/grade';
import { EVAL_QUESTIONS } from '../src/evals/questions';
import { converse } from '../src/loop';
import { firstUserMessage } from '../src/prompt';
import { buildTurnRequest } from '../src/request';
import { runTool } from '../src/tools';

const client = new Anthropic();
const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const questions = ids.length > 0 ? EVAL_QUESTIONS.filter((q) => ids.includes(q.id)) : EVAL_QUESTIONS;
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };

let passed = 0;
for (const q of questions) {
  const ledger = fixtureLedger();
  const expected = (await runTool(q.call.name, q.call.input, ledger, EVAL_NOW)).result;
  try {
    const run = await converse({
      ledger,
      now: EVAL_NOW,
      messages: [{ role: 'user', content: firstUserMessage(q.question, new Date(EVAL_NOW)) }],
      transport: {
        async turn(messages) {
          const res = await client.beta.messages.create(buildTurnRequest(messages));
          usage.calls++;
          usage.input += res.usage.input_tokens;
          usage.output += res.usage.output_tokens;
          usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
          usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
          return { content: res.content, stop_reason: res.stop_reason };
        },
      },
    });
    const g = grade(q, run, expected);
    if (g.pass) passed++;
    console.log(`${g.pass ? 'PASS' : 'FAIL'} ${q.id.padEnd(4)} ${q.question}`);
    if (!g.pass) console.log(`     ${g.reasons.join('; ')}\n     reply: ${run.reply.replace(/\n/g, ' ')}`);
  } catch (error) {
    console.log(`ERROR ${q.id} ${error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : String(error)}`);
  }
}

console.log(`\n${passed}/${questions.length} passed`);
console.log(`${usage.calls} model calls; tokens in ${usage.input} (cache read ${usage.cacheRead}, cache write ${usage.cacheWrite}), out ${usage.output}`);
