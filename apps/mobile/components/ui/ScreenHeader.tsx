import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface ScreenHeaderProps {
  title: string;
  /** Icon of the leading button; defaults to a back arrow. */
  leading?: 'back' | 'close' | 'none';
  onLeadingPress?: () => void;
  /** Optional trailing element (e.g. an "Add" button). */
  trailing?: React.ReactNode;
  bordered?: boolean;
}

export function ScreenHeader({ title, leading = 'back', onLeadingPress, trailing, bordered }: ScreenHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.row,
        { paddingTop: insets.top + Spacing.sm, borderBottomColor: colors.border, borderBottomWidth: bordered ? 1 : 0 },
      ]}
    >
      {leading === 'none' ? (
        <View style={styles.slot} />
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={leading === 'close' ? 'Close' : 'Go back'}
          onPress={onLeadingPress ?? (() => router.back())}
          style={[styles.slot, { backgroundColor: colors.card, borderRadius: BorderRadius.full }]}
        >
          <Ionicons name={leading === 'close' ? 'close' : 'arrow-back'} size={24} color={colors.text} />
        </TouchableOpacity>
      )}
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.slot}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  slot: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
});
