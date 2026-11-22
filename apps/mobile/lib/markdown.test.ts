import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('turns bold, italic and code into styled spans without the markers', () => {
    expect(parseInline('You spent **₹4,200** on *food*, see `Food`.')).toEqual([
      { text: 'You spent ' },
      { text: '₹4,200', bold: true },
      { text: ' on ' },
      { text: 'food', italic: true },
      { text: ', see ' },
      { text: 'Food', code: true },
      { text: '.' },
    ]);
  });

  it('leaves lone asterisks and underscores inside words alone', () => {
    expect(parseInline('2 * 3 = 6 in my_file_name')).toEqual([{ text: '2 * 3 = 6 in my_file_name' }]);
  });
});

describe('parseMarkdown', () => {
  it('reads a typical model answer', () => {
    const blocks = parseMarkdown('### This month\n\nYou are **within budget**.\n\n* Food: ₹3,000\n* Travel: ₹1,200\n  - Uber: ₹800\n1. Cut takeaway\n2) Walk more');
    expect(blocks).toEqual([
      { kind: 'heading', spans: [{ text: 'This month' }] },
      { kind: 'paragraph', spans: [{ text: 'You are ' }, { text: 'within budget', bold: true }, { text: '.' }] },
      { kind: 'item', marker: '•', depth: 0, spans: [{ text: 'Food: ₹3,000' }] },
      { kind: 'item', marker: '•', depth: 0, spans: [{ text: 'Travel: ₹1,200' }] },
      { kind: 'item', marker: '•', depth: 1, spans: [{ text: 'Uber: ₹800' }] },
      { kind: 'item', marker: '1.', depth: 0, spans: [{ text: 'Cut takeaway' }] },
      { kind: 'item', marker: '2.', depth: 0, spans: [{ text: 'Walk more' }] },
    ]);
  });

  it('joins wrapped lines into one paragraph', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'one two' }] },
      { kind: 'paragraph', spans: [{ text: 'three' }] },
    ]);
  });
});
