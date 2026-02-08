import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeProvider, useColorScheme } from '@/contexts/theme-context';
import { SecurityProvider, useSecurity } from '@/contexts/security-context';
import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet, AppState, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { initIntentMonitor } from '@/services/intent-monitor';
import { scheduleDailyReminders } from '@/services/reminder-scheduler';
import { isOnboardingComplete } from '@/services/user-storage';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';

export const unstable_settings = {
  anchor: '(tabs)',
};


const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.surface,
    text: Colors.dark.text,
    border: Colors.dark.border,
    primary: Colors.dark.tint,
  },
};

const CustomLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.light.background,
    card: Colors.light.surface,
    text: Colors.light.text,
    border: Colors.light.border,
    primary: Colors.light.tint,
  },
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isUnlocked, authenticate, isBioLockEnabled, lockApp } = useSecurity();
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);


  React.useEffect(() => {
    let backgroundTime: number | null = null;

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {

        backgroundTime = Date.now();
      } else if (nextAppState === 'active') {

        if (backgroundTime) {
          const timeInBackground = Date.now() - backgroundTime;
          if (timeInBackground > 120000) {
            lockApp();
          }
          backgroundTime = null;
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [lockApp]);


  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await isOnboardingComplete();
        setHasCompletedOnboarding(completed);
        if (!completed) {
          router.replace('/onboarding/profile-setup' as any);
        }
      } catch (error) {
        console.error('Error checking onboarding:', error);
      } finally {
        setIsCheckingOnboarding(false);
      }
    };
    checkOnboarding();
  }, []);


  React.useEffect(() => {
    if (isBioLockEnabled && !isUnlocked) {
      authenticate();
    }



    initIntentMonitor();

    scheduleDailyReminders();
  }, [isBioLockEnabled, isUnlocked]);

  if (!isUnlocked) {
    const currentColors = isDark ? Colors.dark : Colors.light;
    return (
      <View style={[styles.lockContainer, { backgroundColor: currentColors.background }]}>
        <Ionicons name="lock-closed" size={64} color={currentColors.tint} />
        <Text style={[styles.lockTitle, { color: currentColors.text }]}>
          App Locked
        </Text>
        <Text style={[styles.lockSubtitle, { color: currentColors.textSecondary }]}>
          Unlock with biometrics to continue
        </Text>
        <TouchableOpacity
          style={[styles.unlockButton, { backgroundColor: currentColors.tint }]}
          onPress={authenticate}
        >
          <Text style={styles.unlockButtonText}>Unlock App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationThemeProvider value={isDark ? CustomDarkTheme : CustomLightTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="onboarding"
            options={{
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="scanner"
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="payment"
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="manual-entry"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="category-manager"
            options={{
              animation: 'slide_from_right',
            }}
          />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </NavigationThemeProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SecurityProvider>
        <GlobalErrorBoundary>
          <RootLayoutNav />
        </GlobalErrorBoundary>
      </SecurityProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  lockTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: '700',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  lockSubtitle: {
    fontSize: FontSizes.md,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  unlockButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#EC4899',
  },
  unlockButtonText: {
    color: '#FFF',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
