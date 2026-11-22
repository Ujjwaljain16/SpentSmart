import React, { useMemo } from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import { FontSizes, Spacing } from '@/constants/theme';
import { Span, parseMarkdown } from '@/lib/markdown';

function Spans({ spans, color }: { spans: Span[]; color: string }) {
  return spans.map((s, i) => {
    const style: TextStyle[] = [];
    if (s.bold) style.push(styles.bold);
    if (s.italic) style.push(styles.italic);
    if (s.code) style.push(styles.code);
    return (
      <Text key={i} style={[...style, { color }]}>
        {s.text}
      </Text>
    );
  });
}

/** Renders a chat answer's light Markdown as native text, so `**` and `*` never show. */
export function Markdown({ text, color }: { text: string; color: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View style={styles.container}>
      {blocks.map((b, i) =>
        b.kind === 'item' ? (
          <View key={i} style={[styles.item, { paddingLeft: b.depth * Spacing.md }]}>
            <Text style={[styles.text, styles.marker, { color }]}>{b.marker}</Text>
            <Text style={[styles.text, styles.flex, { color }]}>
              <Spans spans={b.spans} color={color} />
            </Text>
          </View>
        ) : (
          <Text key={i} style={[styles.text, b.kind === 'heading' && styles.bold, { color }]}>
            <Spans spans={b.spans} color={color} />
          </Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },
  text: { fontSize: FontSizes.md, lineHeight: 22 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: 'monospace' },
  item: { flexDirection: 'row', gap: Spacing.xs },
  marker: { minWidth: 18 },
  flex: { flex: 1 },
});
