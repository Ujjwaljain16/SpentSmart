import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
// Records uncaught errors from the very start, so a crash during start-up is still kept for Diagnostics.
import '@/lib/app-crash-log';
// Registers the background sync task before anything renders; Android may launch the app only to run it.
import '@/services/cloud/background-sync';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';
import { LockScreen } from '@/components/security/LockScreen';
import { Colors } from '@/constants/theme';
import { CategoriesProvider } from '@/contexts/categories-context';
import { CloudProvider } from '@/contexts/cloud-context';
import { DatabaseProvider } from '@/contexts/database-context';
import { SecurityProvider, useSecurity } from '@/contexts/security-context';
import { SettingsProvider, useSettings } from '@/contexts/settings-context';
import { ThemeProvider, useColorScheme } from '@/contexts/theme-context';
import { loadUpiIntent } from '@/modules/upi-intent';
import { syncReminders } from '@/services/reminders';

export const unstable_settings = {
  anchor: '(tabs)',
};

const navTheme = (scheme: 'light' | 'dark') => {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return { ...base, colors: { ...base.colors, background: c.background, card: c.surface, text: c.text, border: c.border, primary: c.tint } };
};

const systemBars = loadUpiIntent();

function RootNavigator() {
  const scheme = useColorScheme();
  const { isUnlocked } = useSecurity();
  const { settings } = useSettings();
  const onboarded = settings.onboardingComplete;

  useEffect(() => {
    void syncReminders(settings.remindersEnabled);
  }, [settings.remindersEnabled]);

  useEffect(() => {
    void systemBars?.setSystemBarsDark(scheme === 'dark').catch(() => undefined);
  }, [scheme]);

  return (
    <NavigationThemeProvider value={navTheme(scheme)}>
      {/* The lock covers the app instead of replacing it, so unlocking returns to the exact screen and state. */}
      <View style={styles.fill} importantForAccessibility={isUnlocked ? 'auto' : 'no-hide-descendants'}>
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
            <Stack.Screen name="privacy-policy" />
            {/* One quick add at a time: the widget's Add and Speak buttons open it with different params. */}
            <Stack.Screen name="quick-add" getId={() => 'quick-add'} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="transfer" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="accounts" />
            <Stack.Screen name="account-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="budget-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="goal-edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="import-statement" />
            <Stack.Screen name="sync" />
            <Stack.Screen name="sync-conflicts" />
            <Stack.Screen name="assistant" />
            <Stack.Screen name="assistant-settings" />
            <Stack.Screen name="tour" options={{ animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          </Stack.Protected>
        </Stack>
      </View>
      {!isUnlocked ? (
        <View style={StyleSheet.absoluteFill}>
          <LockScreen />
        </View>
      ) : null}
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
                  <CloudProvider>
                    <RootNavigator />
                  </CloudProvider>
                </CategoriesProvider>
              </SecurityProvider>
            </ThemeProvider>
          </SettingsProvider>
        </DatabaseProvider>
      </GlobalErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
