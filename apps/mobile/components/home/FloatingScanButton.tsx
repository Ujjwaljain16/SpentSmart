import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';

export function FloatingScanButton() {
  const colors = useThemeColors();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.05, { duration: 1000 }), withTiming(1, { duration: 1000 })), -1, false);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Scan a UPI QR code"
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push(routes.scanner);
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="scan" size={32} color={colors.onTint} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 100, left: '50%', marginLeft: -36, zIndex: 1000 },
  button: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', elevation: 12 },
});
