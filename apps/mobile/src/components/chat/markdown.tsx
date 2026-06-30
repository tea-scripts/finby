import type { ReactNode } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { parseMarkdown, type Block, type InlineSeg } from '../../lib/markdown';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Render inline segments as children of a parent <Text>. Plain runs stay raw
 *  strings (so a whole-paragraph match resolves to one node); only marked runs
 *  become nested <Text>. */
function renderInline(segs: InlineSeg[]): ReactNode[] {
  return segs.map((s, i) => {
    if (!s.bold && !s.italic && !s.code && !s.href) return s.text;
    const className = [
      s.bold ? 'font-semibold text-ink' : '',
      s.italic ? 'italic' : '',
      s.href ? 'text-accent underline' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <Text
        key={i}
        className={className || undefined}
        style={s.code ? { fontFamily: MONO } : undefined}
        onPress={s.href ? () => void Linking.openURL(s.href!) : undefined}
      >
        {s.text}
      </Text>
    );
  });
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'paragraph':
      return <Text className="text-[15px] leading-relaxed text-ink">{renderInline(block.inline)}</Text>;

    case 'heading': {
      const size = block.level >= 3 ? 'text-sm' : 'text-base';
      return <Text className={`${size} font-semibold text-ink`}>{renderInline(block.inline)}</Text>;
    }

    case 'bullet':
      return (
        <View className="gap-1">
          {block.items.map((item, i) => (
            <View key={i} className="flex-row gap-2">
              <Text className="text-[15px] leading-relaxed text-muted">•</Text>
              <Text className="flex-1 text-[15px] leading-relaxed text-ink">{renderInline(item)}</Text>
            </View>
          ))}
        </View>
      );

    case 'ordered':
      return (
        <View className="gap-1">
          {block.items.map((item, i) => (
            <View key={i} className="flex-row gap-2">
              <Text className="text-[15px] leading-relaxed text-muted">{i + 1}.</Text>
              <Text className="flex-1 text-[15px] leading-relaxed text-ink">{renderInline(item)}</Text>
            </View>
          ))}
        </View>
      );

    case 'quote':
      return (
        <View className="border-l-2 border-line pl-3">
          <Text className="text-[15px] italic leading-relaxed text-muted">{renderInline(block.inline)}</Text>
        </View>
      );

    case 'code':
      return (
        <View className="rounded-lg bg-canvas/60 p-3">
          <Text className="text-[13px] text-ink" style={{ fontFamily: MONO }}>
            {block.text}
          </Text>
        </View>
      );

    case 'rule':
      return <View className="h-px bg-line" />;

    case 'table':
      return (
        <View className="overflow-hidden rounded-lg border border-line">
          <View className="flex-row border-b border-line bg-surface">
            {block.header.map((cell, ci) => (
              <View key={ci} className={`flex-1 px-2 py-1.5 ${ci ? 'border-l border-line' : ''}`}>
                <Text className="text-[13px] font-semibold text-ink">{renderInline(cell)}</Text>
              </View>
            ))}
          </View>
          {block.rows.map((row, ri) => (
            <View key={ri} className={`flex-row ${ri ? 'border-t border-line' : ''}`}>
              {row.map((cell, ci) => (
                <View key={ci} className={`flex-1 px-2 py-1.5 ${ci ? 'border-l border-line' : ''}`}>
                  <Text className="text-[13px] text-ink">{renderInline(cell)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );

    default:
      return null;
  }
}

/** Renders assistant Markdown inside a chat bubble — tables, bold/italic, lists,
 *  inline/fenced code, links, quotes and rules — styled to the dark theme to
 *  match the web bubble. User text is rendered verbatim by the caller. */
export function Markdown({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <View className="gap-2">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </View>
  );
}
