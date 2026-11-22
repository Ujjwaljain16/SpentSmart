import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BorderRadius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface ProgressBarProps {
  /** Whole percent; values past 100 fill the bar and switch to the warning colour. */
  percent: number;
  /** Where the projection lands, drawn as a thin marker, in whole percent. */
  markerPercent?: number;
  color?: string;
  accessibilityLabel?: string;
}

export function ProgressBar({ percent, markerPercent, color, accessibilityLabel }: ProgressBarProps) {
  const colors = useThemeColors();
  const clamped = Math.max(0, Math.min(100, percent));
  const fill = percent > 100 ? colors.error : percent >= 85 ? colors.warning : color ?? colors.tint;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      style={[styles.track, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: fill }]} />
      {markerPercent !== undefined && markerPercent > 0 && markerPercent <= 100 ? (
        <View style={[styles.marker, { left: `${markerPercent}%`, backgroundColor: colors.text }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: BorderRadius.full, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: BorderRadius.full },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, opacity: 0.6 },
});
