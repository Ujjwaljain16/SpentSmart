import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export function FormCard({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return <Text style={[styles.label, { color: colors.textSecondary }]}>{children}</Text>;
}

export function TextField(props: TextInputProps & { accessibilityLabel: string }) {
  const colors = useThemeColors();
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      {...props}
      style={[styles.input, { color: colors.text, borderColor: colors.border }, props.style]}
    />
  );
}

/** Big rupee amount input. `invalid` shows the hint under it. */
export function AmountField({ value, onChangeText, invalid, label, autoFocus }: { value: string; onChangeText: (t: string) => void; invalid?: boolean; label: string; autoFocus?: boolean }) {
  const colors = useThemeColors();
  return (
    <View>
      <View style={styles.amountRow}>
        <Text style={[styles.currency, { color: colors.text }]}>₹</Text>
        <TextInput
          accessibilityLabel={label}
          style={[styles.amountInput, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          maxLength={12}
          autoFocus={autoFocus}
        />
      </View>
      {invalid ? <Text style={[styles.error, { color: colors.error }]}>Enter an amount like 250 or 250.50</Text> : null}
    </View>
  );
}

export function ChoiceChips<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string }) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chipRow}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: active ? colors.tint : colors.surface, borderColor: active ? colors.tint : colors.border }]}
          >
            <Text numberOfLines={1} style={[styles.chipText, { color: active ? colors.onTint : colors.textSecondary }]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  label: { fontSize: FontSizes.sm, marginTop: Spacing.sm },
  input: { fontSize: FontSizes.md, minHeight: 44, borderBottomWidth: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  currency: { fontSize: 40, fontWeight: '700', marginRight: 8 },
  amountInput: { fontSize: 56, fontWeight: '700', minWidth: 120 },
  error: { fontSize: FontSizes.xs, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: MIN_TOUCH_TARGET - 8, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: FontSizes.sm, fontWeight: '700' },
});
