import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('returns a single plain segment for unmarked text', () => {
    expect(parseInline('hello world')).toEqual([{ text: 'hello world' }]);
  });

  it('parses bold (** and __)', () => {
    expect(parseInline('**Left**')).toEqual([{ text: 'Left', bold: true }]);
    expect(parseInline('__Left__')).toEqual([{ text: 'Left', bold: true }]);
  });

  it('parses italic (*)', () => {
    expect(parseInline('*hi*')).toEqual([{ text: 'hi', italic: true }]);
  });

  it('does not treat intraword underscores as italic', () => {
    expect(parseInline('expo_secure_store')).toEqual([{ text: 'expo_secure_store' }]);
  });

  it('parses inline code verbatim', () => {
    expect(parseInline('`a*b`')).toEqual([{ text: 'a*b', code: true }]);
  });

  it('parses links', () => {
    expect(parseInline('[Finby](https://finby.app)')).toEqual([
      { text: 'Finby', href: 'https://finby.app' },
    ]);
  });

  it('mixes plain and marked segments in order', () => {
    expect(parseInline('a **b** c')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c' },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('parses a heading with its level', () => {
    expect(parseMarkdown('## Title')).toEqual([
      { type: 'heading', level: 2, inline: [{ text: 'Title' }] },
    ]);
  });

  it('keeps soft line breaks inside a paragraph', () => {
    expect(parseMarkdown('a\nb')).toEqual([
      { type: 'paragraph', inline: [{ text: 'a\nb' }] },
    ]);
  });

  it('parses bullet and ordered lists', () => {
    const bullets = parseMarkdown('- a\n- b');
    expect(bullets).toEqual([
      { type: 'bullet', items: [[{ text: 'a' }], [{ text: 'b' }]] },
    ]);
    const ordered = parseMarkdown('1. a\n2. b');
    expect(ordered).toEqual([
      { type: 'ordered', items: [[{ text: 'a' }], [{ text: 'b' }]] },
    ]);
  });

  it('parses a fenced code block verbatim', () => {
    expect(parseMarkdown('```\nx = 1\ny = 2\n```')).toEqual([
      { type: 'code', text: 'x = 1\ny = 2' },
    ]);
  });

  it('parses a horizontal rule (not a table delimiter)', () => {
    expect(parseMarkdown('---')).toEqual([{ type: 'rule' }]);
  });

  it('parses a GFM table with bold cells and an empty header cell', () => {
    const md = [
      '| | NGN |',
      '|---|---|',
      '| Available | ₦232,453.55 |',
      '| **Left in Zenith** | **~₦24,453** |',
    ].join('\n');
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const table = blocks[0]!;
    expect(table.type).toBe('table');
    if (table.type !== 'table') throw new Error('expected table');
    expect(table.header).toEqual([[], [{ text: 'NGN' }]]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual([[{ text: 'Available' }], [{ text: '₦232,453.55' }]]);
    expect(table.rows[1]).toEqual([
      [{ text: 'Left in Zenith', bold: true }],
      [{ text: '~₦24,453', bold: true }],
    ]);
  });

  it('parses a mixed document into ordered blocks', () => {
    const md = [
      'Your Zenith breakdown remains:',
      '',
      '| | NGN |',
      '|---|---|',
      '| Available | ₦232,453.55 |',
      '',
      'Update me when you make the payments! 🙏',
    ].join('\n');
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'table', 'paragraph']);
  });
});
