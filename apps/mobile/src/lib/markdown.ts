/** A tiny, dependency-free Markdown parser tuned for the chat bubble. It covers
 *  exactly what the assistant emits — paragraphs (with soft breaks), headings,
 *  bold/italic/inline-code/links, bullet & ordered lists, blockquotes, fenced
 *  code, horizontal rules, and GFM tables — and degrades any unknown syntax to
 *  plain text. Output is a flat block list the RN `Markdown` component renders;
 *  parsing lives here (pure) so it is exhaustively unit-tested without a renderer. */

export interface InlineSeg {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

export type Block =
  | { type: 'paragraph'; inline: InlineSeg[] }
  | { type: 'heading'; level: number; inline: InlineSeg[] }
  | { type: 'bullet'; items: InlineSeg[][] }
  | { type: 'ordered'; items: InlineSeg[][] }
  | { type: 'quote'; inline: InlineSeg[] }
  | { type: 'code'; text: string }
  | { type: 'rule' }
  | { type: 'table'; header: InlineSeg[][]; rows: InlineSeg[][][] };

const INLINE_CODE = /^`([^`]+)`/;
const BOLD = /^(\*\*|__)([\s\S]+?)\1/;
const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)/;
// Asterisk emphasis only (open not followed by space) — underscores are left as
// plain text so identifiers like `snake_case` are not mangled.
const ITALIC = /^\*(?!\s)([\s\S]+?)\*/;

/** Split an inline string into styled segments. Recurses into bold/italic/link
 *  bodies so marks compose; inline code is captured verbatim. */
export function parseInline(text: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  let plain = '';
  let i = 0;
  const flush = () => {
    if (plain) {
      out.push({ text: plain });
      plain = '';
    }
  };
  while (i < text.length) {
    const rest = text.slice(i);

    const code = rest.match(INLINE_CODE);
    if (code) {
      flush();
      out.push({ text: code[1]!, code: true });
      i += code[0].length;
      continue;
    }
    const bold = rest.match(BOLD);
    if (bold) {
      flush();
      for (const seg of parseInline(bold[2]!)) out.push({ ...seg, bold: true });
      i += bold[0].length;
      continue;
    }
    const link = rest.match(LINK);
    if (link) {
      flush();
      const label = link[1]!;
      const inner = parseInline(label);
      const segs = inner.length ? inner : [{ text: label }];
      for (const seg of segs) out.push({ ...seg, href: link[2]! });
      i += link[0].length;
      continue;
    }
    const italic = rest.match(ITALIC);
    if (italic) {
      flush();
      for (const seg of parseInline(italic[1]!)) out.push({ ...seg, italic: true });
      i += italic[0].length;
      continue;
    }

    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(```|~~~)/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isTableDelimiter(line: string): boolean {
  if (!line.includes('|')) return false;
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/** Parse a Markdown document into a flat block list. */
export function parseMarkdown(content: string): Block[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const at = (n: number): string => lines[n] ?? '';
  const blocks: Block[] = [];
  let i = 0;

  const startsBlock = (n: number): boolean =>
    HEADING.test(at(n)) ||
    RULE.test(at(n)) ||
    FENCE.test(at(n)) ||
    BULLET.test(at(n)) ||
    ORDERED.test(at(n)) ||
    QUOTE.test(at(n)) ||
    (at(n).includes('|') && isTableDelimiter(at(n + 1)));

  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !at(i).trimStart().startsWith(marker)) {
        body.push(at(i));
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing fence
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length, inline: parseInline(heading[2]!.trim()) });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }

    if (line.includes('|') && isTableDelimiter(at(i + 1))) {
      const header = splitCells(line).map((c) => parseInline(c));
      i += 2;
      const rows: InlineSeg[][][] = [];
      while (i < lines.length && at(i).includes('|') && at(i).trim() !== '') {
        rows.push(splitCells(at(i)).map((c) => parseInline(c)));
        i += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && QUOTE.test(at(i))) {
        parts.push(at(i).match(QUOTE)![1]!);
        i += 1;
      }
      blocks.push({ type: 'quote', inline: parseInline(parts.join('\n')) });
      continue;
    }

    if (BULLET.test(line)) {
      const items: InlineSeg[][] = [];
      while (i < lines.length && BULLET.test(at(i))) {
        items.push(parseInline(at(i).match(BULLET)![1]!));
        i += 1;
      }
      blocks.push({ type: 'bullet', items });
      continue;
    }

    if (ORDERED.test(line)) {
      const items: InlineSeg[][] = [];
      while (i < lines.length && ORDERED.test(at(i))) {
        items.push(parseInline(at(i).match(ORDERED)![1]!));
        i += 1;
      }
      blocks.push({ type: 'ordered', items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && at(i).trim() !== '' && !startsBlock(i)) {
      para.push(at(i));
      i += 1;
    }
    if (para.length) {
      blocks.push({ type: 'paragraph', inline: parseInline(para.join('\n')) });
    } else {
      i += 1; // safety: never stall
    }
  }

  return blocks;
}
