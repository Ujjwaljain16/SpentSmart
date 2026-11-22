import type Anthropic from '@anthropic-ai/sdk';
import { MODEL, SYSTEM_PROMPT } from './prompt';
import { TOOL_DEFINITIONS } from './tools';

/**
 * The one request shape the server sends for an assistant turn. The client supplies only the conversation; the
 * model, instructions and tools are fixed here, so the endpoint can't be used as a general-purpose model proxy.
 */
export function buildTurnRequest(messages: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: 16000,
    // Short conversational answers over a handful of tools; raise if eval scores show headroom.
    output_config: { effort: 'medium' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: TOOL_DEFINITIONS,
    messages,
    // If the model declines a turn, the API retries it on a fallback model inside the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  };
}
