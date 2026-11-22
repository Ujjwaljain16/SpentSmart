import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { DimensionValue, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BorderRadius, FontSizes } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface SlideToPayProps {
  onSuccess: () => void;
  appName: string;
  appIconName?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  height?: number;
  width?: DimensionValue;
  /** Change this value to bring the slider back to its start (e.g. after a cancelled payment). */
  resetToken?: number;
}

const BUTTON_PADDING = 4;
const SWIPE_THRESHOLD = 0.7;

export function SlideToPay({ onSuccess, appName, appIconName = 'wallet', disabled = false, height = 52, width = '100%', resetToken = 0 }: SlideToPayProps) {
  const colors = useThemeColors();
  const translateX = useSharedValue(0);
  const containerWidth = useSharedValue(0);
  const knob = height - BUTTON_PADDING * 2;
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    translateX.value = withSpring(0, { damping: 15 });
    setCompleted(false);
  }, [resetToken, translateX]);

  const complete = () => {
    setCompleted(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSuccess();
  };

  const maxTravel = () => {
    'worklet';
    return Math.max(containerWidth.value - knob - BUTTON_PADDING * 2, 1);
  };

  const pan = Gesture.Pan()
    .enabled(!disabled && !completed)
    .onBegin(() => {
      runOnJS(Haptics.selectionAsync)();
    })
    .onUpdate((event) => {
      translateX.value = Math.min(Math.max(event.translationX, 0), maxTravel());
    })
    .onEnd(() => {
      const max = maxTravel();
      if (translateX.value > max * SWIPE_THRESHOLD) {
        translateX.value = withSpring(max, { damping: 15 });
        runOnJS(complete)();
      } else {
        translateX.value = withSpring(0, { damping: 15 });
      }
    });

  const sliderStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, maxTravel() / 2], [1, 0], Extrapolation.CLAMP),
  }));
  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(translateX.value, [0, maxTravel()], [colors.card, `${colors.tint}33`]),
  }));

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Pay with ${appName}`}
      accessibilityHint="Double tap to pay. Sliding is also supported."
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'activate', label: `Pay with ${appName}` }]}
      onAccessibilityAction={() => !disabled && !completed && complete()}
      style={[styles.container, { height, width, backgroundColor: colors.card, borderColor: colors.border, opacity: disabled ? 0.6 : 1 }]}
      onLayout={(e) => {
        containerWidth.value = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, fillStyle]} />
      <Animated.View style={[styles.textContainer, textStyle]}>
        <Text style={[styles.text, { color: colors.textSecondary }]}>Slide to open {appName} »</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.slider,
            sliderStyle,
            { height: knob, width: knob, borderColor: colors.border, backgroundColor: completed ? colors.tint : colors.card },
          ]}
        >
          <Ionicons name={completed ? 'checkmark' : appIconName} size={24} color={completed ? colors.onTint : colors.text} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: BorderRadius.full, borderWidth: 1, justifyContent: 'center', overflow: 'hidden', marginVertical: 4 },
  textContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: FontSizes.md, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  slider: { position: 'absolute', left: BUTTON_PADDING, borderRadius: BorderRadius.full, justifyContent: 'center', alignItems: 'center', borderWidth: 1, elevation: 2 },
});
