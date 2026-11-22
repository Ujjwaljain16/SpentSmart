import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { GetStartedItem, GetStartedStep } from '@/lib/get-started';

export function GetStartedCard({ items, onPress, onHide }: { items: GetStartedItem[]; onPress: (step: GetStartedStep) => void; onHide: () => void }) {
  const colors = useThemeColors();
  const done = items.filter((i) => i.done).length;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            Get started
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {done} of {items.length} done
          </Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Hide the Get started checklist" style={styles.hide} onPress={onHide}>
          <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Hide</Text>
        </TouchableOpacity>
      </View>
      {items.map((item) => (
        <TouchableOpacity
          key={item.step}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.optional ? ', optional' : ''}`}
          accessibilityState={{ checked: item.done }}
          style={[styles.row, { borderTopColor: colors.border }]}
          onPress={() => onPress(item.step)}
        >
          <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={item.done ? colors.success : colors.textSecondary} />
          <View style={styles.flex}>
            <Text style={[styles.itemTitle, { color: item.done ? colors.textSecondary : colors.text, textDecorationLine: item.done ? 'line-through' : 'none' }]}>
              {item.title}
              {item.optional ? <Text style={{ color: colors.textSecondary, fontWeight: '400' }}> · optional</Text> : null}
            </Text>
            {!item.done ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{item.hint}</Text> : null}
          </View>
          {!item.done ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, marginBottom: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: Spacing.sm },
  flex: { flex: 1 },
  title: { fontSize: FontSizes.lg, fontWeight: '700' },
  hint: { fontSize: FontSizes.sm, marginTop: 2 },
  hide: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: 'center', alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: MIN_TOUCH_TARGET + 8, paddingVertical: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  itemTitle: { fontSize: FontSizes.md, fontWeight: '600' },
});
