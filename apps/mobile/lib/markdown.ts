/**
 * The small slice of Markdown that chat models actually send: paragraphs, headings, bullet and numbered lists,
 * **bold**, *italic* and `code`. Anything else stays as plain text, so nothing is ever lost.
 */

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type Block =
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'heading'; spans: Span[] }
  | { kind: 'item'; marker: string; depth: number; spans: Span[] };

const INLINE = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_)/g;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    // `_` inside words (snake_case, file names) isn't emphasis.
    if (m[6] !== undefined && /\w/.test(text[start - 1] ?? '')) continue;
    if (start > last) spans.push({ text: text.slice(last, start) });
    if (m[2] ?? m[3]) spans.push({ text: (m[2] ?? m[3])!, bold: true });
    else if (m[4]) spans.push({ text: m[4], code: true });
    else spans.push({ text: (m[5] ?? m[6])!, italic: true });
    last = start + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^(\s*)[-*•+]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', spans: parseInline(heading[1]!.replace(/\s*#+$/, '')) });
    } else if (bullet) {
      flush();
      blocks.push({ kind: 'item', marker: '•', depth: bullet[1]!.length >= 2 ? 1 : 0, spans: parseInline(bullet[2]!) });
    } else if (numbered) {
      flush();
      blocks.push({ kind: 'item', marker: `${numbered[2]}.`, depth: numbered[1]!.length >= 2 ? 1 : 0, spans: parseInline(numbered[3]!) });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}
