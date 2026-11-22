import type Anthropic from '@anthropic-ai/sdk';
import { CreateTurn } from './assistant';

type Block = Anthropic.Beta.BetaContentBlock;

/**
 * A stand-in for Claude for local testing: picks a tool from keywords, then answers by quoting the tool's amounts.
 * It exercises the whole chat path (phone loop, tools on the phone, proposals, amount tracing) without an API key or
 * any spend. Not a real assistant, and never enabled in production.
 */
export function fakeModel(): CreateTurn {
  let n = 0;
  return async (messages) => {
    const last = messages[messages.length - 1]!;
    const content = last.content;
    const toolResults = Array.isArray(content) ? content.filter((b) => (b as { type?: string }).type === 'tool_result') : [];

    if (toolResults.length > 0) {
      const text = toolResults.map((r) => String((r as { content?: unknown }).content ?? '')).join(' ');
      const amounts = [...new Set(text.match(/₹[\d,]+(\.\d{1,2})?/g) ?? [])].slice(0, 3);
      const reply = /not saved yet/.test(text)
        ? `Ready to add ${amounts[0] ?? 'that'}. Please confirm it below.`
        : amounts.length > 0
          ? `Here’s what I found: ${amounts.join(', ')}.`
          : 'I couldn’t find anything for that.';
      return { content: [{ type: 'text', text: `${reply} (test model)`, citations: null } as unknown as Block], stop_reason: 'end_turn' };
    }

    const question = typeof content === 'string' ? content : (content ?? []).map((b) => (b as { text?: string }).text ?? '').join(' ');
    // The phone starts a conversation with today's date; only the question after it matters here.
    const q = (question.split('\n\n').pop() ?? question).toLowerCase();
    const rupees = Number((q.match(/(\d[\d,]*)/)?.[1] ?? '0').replace(/,/g, ''));
    let call: { name: string; input: Record<string, unknown> };
    if (/\b(add|record|log)\b/.test(q) && rupees > 0) {
      call = { name: 'create_transaction', input: { amount_rupees: rupees, type: 'expense', payee: 'Added from chat', category: null, date: null, note: null } };
    } else if (/afford|buy/.test(q) && rupees > 0) {
      call = { name: 'can_i_afford', input: { amount_rupees: rupees } };
    } else if (/budget/.test(q)) {
      call = { name: 'budget_status', input: {} };
    } else if (/bill|subscription|recurring/.test(q)) {
      call = { name: 'upcoming_recurring', input: {} };
    } else if (/goal|saving for/.test(q)) {
      call = { name: 'goals_status', input: {} };
    } else {
      call = { name: 'get_summary', input: { period: /last month/.test(q) ? 'last_month' : /week/.test(q) ? 'this_week' : 'this_month' } };
    }
    return { content: [{ type: 'tool_use', id: `fake_${++n}`, name: call.name, input: call.input } as unknown as Block], stop_reason: 'tool_use' };
  };
}
