import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, accessibilityLabel, style }: ButtonProps) {
  const colors = useThemeColors();
  const palette = {
    primary: { bg: colors.tint, fg: colors.onTint, border: colors.tint },
    secondary: { bg: colors.card, fg: colors.text, border: colors.border },
    danger: { bg: 'transparent', fg: colors.error, border: colors.error },
    ghost: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.55 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: FontSizes.md, fontWeight: '600' },
});
