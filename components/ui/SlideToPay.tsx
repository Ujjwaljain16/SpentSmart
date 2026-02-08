import React, { useEffect } from 'react';
import { StyleSheet, View, Text, DimensionValue } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolate,
    interpolateColor,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SlideToPayProps {
    onSuccess: () => void;
    appName: string;
    appIconName?: keyof typeof Ionicons.glyphMap;
    disabled?: boolean;
    height?: number;
    width?: DimensionValue;
}

const BUTTON_HEIGHT = 52;
const BUTTON_PADDING = 4;
const SWIPE_THRESHOLD = 0.7;

export const SlideToPay: React.FC<SlideToPayProps> = ({
    onSuccess,
    appName,
    appIconName = 'wallet',
    disabled = false,
    height = BUTTON_HEIGHT,
    width = '100%'
}) => {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];

    const translateX = useSharedValue(0);
    const isComplete = useSharedValue(false);
    const containerWidth = useSharedValue(0);

    const panGesture = Gesture.Pan()
        .enabled(!disabled && !isComplete.value)
        .onBegin(() => {
            if (disabled || isComplete.value) return;
            runOnJS(Haptics.selectionAsync)();
        })
        .onUpdate((event) => {
            if (disabled || isComplete.value) return;
            const max = containerWidth.value - (height - BUTTON_PADDING * 2) - BUTTON_PADDING * 2;
            translateX.value = Math.min(Math.max(event.translationX, 0), max);
        })
        .onEnd(() => {
            if (disabled || isComplete.value) return;
            const max = containerWidth.value - (height - BUTTON_PADDING * 2) - BUTTON_PADDING * 2;

            if (translateX.value > max * SWIPE_THRESHOLD) {
                // Success
                translateX.value = withSpring(max, { damping: 15 });
                isComplete.value = true;
                runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
                runOnJS(onSuccess)();
            } else {
                // Reset
                translateX.value = withSpring(0, { damping: 15 });
            }
        });

    const animatedSliderStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
            backgroundColor: isComplete.value ? colors.tint : colors.card,
        };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
        const max = Math.max(containerWidth.value - (height - BUTTON_PADDING * 2) - BUTTON_PADDING * 2, 1); // Avoid div by 0
        const opacity = interpolate(
            translateX.value,
            [0, max / 2],
            [1, 0],
            Extrapolate.CLAMP
        );
        return { opacity };
    });

    const animatedBackgroundStyle = useAnimatedStyle(() => {
        const max = Math.max(containerWidth.value - (height - BUTTON_PADDING * 2) - BUTTON_PADDING * 2, 1);
        return {
            backgroundColor: interpolateColor(
                translateX.value,
                [0, max],
                [colors.card, colors.tint + '15'] // 15% opacity tint for background fill
            )
        };
    });

    return (
        <View
            style={[
                styles.container,
                {
                    height,
                    width,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderWidth: 1
                }
            ]}
            onLayout={(e) => {
                containerWidth.value = e.nativeEvent.layout.width;
            }}
        >
            <Animated.View style={[styles.background, animatedBackgroundStyle, { backgroundColor: colors.tint }]} />

            <Animated.View style={[styles.textContainer, animatedTextStyle]}>
                <Text style={[styles.text, { color: colors.textSecondary }]}>
                    Slide to open {appName} {'>>'}
                </Text>
            </Animated.View>

            <GestureDetector gesture={panGesture}>
                <Animated.View
                    style={[
                        styles.slider,
                        animatedSliderStyle,
                        {
                            height: height - BUTTON_PADDING * 2,
                            width: height - BUTTON_PADDING * 2,
                            borderColor: colors.border
                        },
                    ]}
                >
                    <Ionicons
                        name={isComplete.value ? "checkmark" : appIconName}
                        size={24}
                        color={isComplete.value ? "#FFF" : colors.text}
                    />
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        justifyContent: 'center',
        overflow: 'hidden',
        marginVertical: 4,
        position: 'relative',
        backgroundColor: 'transparent',
    },
    background: {
        ...StyleSheet.absoluteFillObject,
    },
    textContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    slider: {
        position: 'absolute',
        left: BUTTON_PADDING,
        borderRadius: BorderRadius.full,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        elevation: 2,
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
    },
});
