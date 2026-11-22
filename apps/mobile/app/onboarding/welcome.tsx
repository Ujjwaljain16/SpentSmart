import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Tour } from '@/components/onboarding/Tour';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';

export default function WelcomeScreen() {
  const colors = useThemeColors();
  return (
    <>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <Tour doneLabel="Get started" onDone={() => router.replace(routes.onboarding)} />
    </>
  );
}
