import React from 'react';
import { View, ViewStyle, Platform } from 'react-native';

// Try to import LinearGradient, but handle if it fails
let LinearGradient: any = null;
try {
    // This will fail in Expo Go
    const gradient = require('expo-linear-gradient');
    LinearGradient = gradient.LinearGradient;
} catch (e) {
    console.log('📱 Expo Go detected - using solid color fallback');
}

interface SafeGradientProps {
    colors: readonly [string, string, ...string[]];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    style?: ViewStyle;
    children?: React.ReactNode;
}

/**
 * SafeGradient - Works in Expo Go (solid color) and production (real gradient)
 */
export function SafeGradient({ colors, start, end, style, children }: SafeGradientProps) {
    // If LinearGradient is available (production build), use it
    if (LinearGradient) {
        return (
            <LinearGradient colors={colors} start={start} end={end} style={style}>
                {children}
            </LinearGradient>
        );
    }

    // Fallback for Expo Go: use first color as solid background
    return (
        <View style={[style, { backgroundColor: colors[0] }]}>
            {children}
        </View>
    );
}
