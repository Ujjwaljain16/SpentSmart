import { Stack } from 'expo-router';
import React from 'react';

// The tour, then name and avatar, then the optional setup steps. Without this the router may open on a later step and
// a new user never gets asked their name.
export const unstable_settings = { initialRouteName: 'welcome' };

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="setup" />
    </Stack>
  );
}
