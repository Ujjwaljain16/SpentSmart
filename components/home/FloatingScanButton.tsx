import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
    withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export function FloatingScanButton() {
    const scale = useSharedValue(1);

    useEffect(() => {
        // Pulse animation
        scale.value = withRepeat(
            withSequence(
                withTiming(1.05, { duration: 1000 }),
                withTiming(1, { duration: 1000 })
            ),
            -1, // infinite
            false
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/scanner');
    };

    return (
        <Animated.View style={[styles.container, animatedStyle]}>
            <TouchableOpacity
                style={styles.button}
                onPress={handlePress}
                activeOpacity={0.8}
            >
                <Ionicons name="scan" size={32} color="#1E3A8A" />
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 100, // Above bottom nav
        left: '50%',
        marginLeft: -36, // Half of button width
        zIndex: 1000,
    },
    button: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#FFF',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0px 12px 20px rgba(0, 0, 0, 0.5)',
        elevation: 16,
    },
});
