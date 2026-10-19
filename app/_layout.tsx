import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';
import { LockScreen } from '@/components/security/LockScreen';
import { Colors } from '@/constants/theme';
import { CategoriesProvider } from '@/contexts/categories-context';
import { DatabaseProvider } from '@/contexts/database-context';
import { SecurityProvider, useSecurity } from '@/contexts/security-context';
import { SettingsProvider, useSettings } from '@/contexts/settings-context';
import { ThemeProvider, useColorScheme } from '@/contexts/theme-context';
import { syncReminders } from '@/services/reminders';

export const unstable_settings = {
  anchor: '(tabs)',
};

const navTheme = (scheme: 'light' | 'dark') => {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return { ...base, colors: { ...base.colors, background: c.background, card: c.surface, text: c.text, border: c.border, primary: c.tint } };
};

function RootNavigator() {
  const scheme = useColorScheme();
  const { isUnlocked } = useSecurity();
  const { settings } = useSettings();
  const onboarded = settings.onboardingComplete;

  useEffect(() => {
    void syncReminders(settings.remindersEnabled);
  }, [settings.remindersEnabled]);

  if (!isUnlocked) return <LockScreen />;

  return (
    <NavigationThemeProvider value={navTheme(scheme)}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scanner" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="manual-entry" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="payment" />
          <Stack.Screen name="recover-pending" />
          <Stack.Screen name="receive" />
          <Stack.Screen name="category-manager" />
          <Stack.Screen name="analytics-detail" />
          <Stack.Screen name="edit-transaction" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="privacy-dashboard" />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GlobalErrorBoundary>
        <DatabaseProvider>
          <SettingsProvider>
            <ThemeProvider>
              <SecurityProvider>
                <CategoriesProvider>
                  <RootNavigator />
                </CategoriesProvider>
              </SecurityProvider>
            </ThemeProvider>
          </SettingsProvider>
        </DatabaseProvider>
      </GlobalErrorBoundary>
    </GestureHandlerRootView>
  );
}
