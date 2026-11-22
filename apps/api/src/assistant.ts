import Anthropic from '@anthropic-ai/sdk';
import { buildTurnRequest } from '@spentsmart/assistant/request';
import { z } from 'zod';

export type TurnResponse = { content: Anthropic.Beta.BetaContentBlock[]; stop_reason: string | null };
export type CreateTurn = (messages: Anthropic.Beta.BetaMessageParam[]) => Promise<TurnResponse>;

/** Errors from the model provider, already reduced to what the phone should be told. */
export class UpstreamError extends Error {
  constructor(public readonly status: 429 | 502 | 503, message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * The conversation as the phone sends it. Only user and assistant turns: a client-supplied system message would let
 * the caller rewrite the assistant's instructions. Blocks are passed through as-is (the model's own output has to go
 * back unchanged), with a size cap instead of a deep schema.
 */
export const turnRequest = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.union([z.string().min(1).max(4000), z.array(z.record(z.unknown())).min(1).max(30)]) }))
      .min(1)
      .max(60),
  })
  .refine((b) => b.messages[0]?.role === 'user', 'conversation must start with the user')
  .refine((b) => JSON.stringify(b).length <= 200_000, 'conversation too long');

export function anthropicTurns(client: Anthropic = new Anthropic()): CreateTurn {
  return async (messages) => {
    try {
      const response = await client.beta.messages.create(buildTurnRequest(messages));
      return { content: response.content, stop_reason: response.stop_reason };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) throw new UpstreamError(429, 'The assistant is busy. Try again in a minute.');
      if (error instanceof Anthropic.APIConnectionError) throw new UpstreamError(503, 'Could not reach the assistant.');
      if (error instanceof Anthropic.APIError) throw new UpstreamError(502, 'The assistant could not answer that.');
      throw error;
    }
  };
}

/** Per-user sliding window. One instance on a free tier, so memory is enough. */
export function perUserLimit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (userId: string, now = Date.now()) => {
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(userId, recent);
      return false;
    }
    recent.push(now);
    hits.set(userId, recent);
    return true;
  };
}
