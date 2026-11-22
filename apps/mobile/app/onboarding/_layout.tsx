import { Stack } from 'expo-router';
import React from 'react';

// Name and avatar first, then the optional setup steps. Without this the router may open on "setup" and a new user
// never gets asked their name.
export const unstable_settings = { initialRouteName: 'profile-setup' };

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="setup" />
    </Stack>
  );
}
