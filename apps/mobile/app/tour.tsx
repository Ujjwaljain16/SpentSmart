import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Tour } from '@/components/onboarding/Tour';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** The first-launch tour again, from Settings. */
export default function TourScreen() {
  const colors = useThemeColors();
  return (
    <>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <Tour doneLabel="Done" onDone={() => router.back()} />
    </>
  );
}
