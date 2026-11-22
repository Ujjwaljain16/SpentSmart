import type Anthropic from '@anthropic-ai/sdk';
import { LedgerSource } from './ledger';
import { Proposal, ToolOutcome, runTool } from './tools';
import { StatedAmount, untracedAmounts } from './traceability';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlock;

/** One model turn. The app sends it through the SpentSmart API, which holds the API key and the system prompt. */
export interface AssistantTransport {
  turn(messages: MessageParam[]): Promise<{ content: ContentBlock[]; stop_reason: string | null }>;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  outcome: ToolOutcome;
}

export interface ConversationResult {
  /** The full history to continue the conversation with, model output kept verbatim. */
  messages: MessageParam[];
  reply: string;
  toolCalls: ToolCallRecord[];
  /** Changes the model proposed; the app shows each one and saves it only when the user confirms. */
  proposals: Proposal[];
  stopReason: string | null;
  /** Amounts in the reply that no tool returned. Shown to the user as unverified. */
  untraced: StatedAmount[];
}

const MAX_STEPS = 8;

const textOf = (content: readonly ContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

/**
 * The tool loop runs on the phone: the model asks for a tool, the phone runs it against its own database, and only
 * the result goes back. Assistant content is appended unchanged so thinking blocks stay valid across turns.
 */
export async function converse(opts: {
  transport: AssistantTransport;
  ledger: LedgerSource;
  now: number;
  messages: MessageParam[];
  maxSteps?: number;
}): Promise<ConversationResult> {
  const messages = [...opts.messages];
  const toolCalls: ToolCallRecord[] = [];
  const proposals: Proposal[] = [];
  let reply = '';
  let stopReason: string | null = null;

  for (let step = 0; step < (opts.maxSteps ?? MAX_STEPS); step++) {
    const response = await opts.transport.turn(messages);
    stopReason = response.stop_reason;
    messages.push({ role: 'assistant', content: response.content });

    if (stopReason === 'refusal') {
      reply = 'I can’t help with that one.';
      break;
    }
    if (stopReason === 'pause_turn') continue;

    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (stopReason !== 'tool_use' || uses.length === 0) {
      reply = textOf(response.content);
      if (stopReason === 'max_tokens') reply += reply ? '\n\n(The answer was cut short.)' : 'The answer was cut short. Try a narrower question.';
      break;
    }

    // All results go back in one user message, which keeps parallel tool calls working.
    const results = await Promise.all(
      uses.map(async (use) => {
        let outcome: ToolOutcome;
        try {
          outcome = await runTool(use.name, use.input, opts.ledger, opts.now);
        } catch {
          outcome = { result: { error: 'The tool failed. Try a different question.' }, isError: true };
        }
        toolCalls.push({ name: use.name, input: use.input, outcome });
        if (outcome.proposal) proposals.push(outcome.proposal);
        return {
          type: 'tool_result' as const,
          tool_use_id: use.id,
          content: JSON.stringify(outcome.result),
          ...(outcome.isError ? { is_error: true } : {}),
        };
      }),
    );
    messages.push({ role: 'user', content: results });
  }

  if (!reply && stopReason === 'tool_use') reply = 'That took too many steps. Try asking something more specific.';
  return { messages, reply, toolCalls, proposals, stopReason, untraced: untracedAmounts(reply, toolCalls.map((c) => c.outcome.result)) };
}
