import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { FontSizes, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/settings-context';
import { useThemeColors } from '@/hooks/use-theme-colors';

export default function ProfileSetupScreen() {
  const colors = useThemeColors();
  const { setSetting } = useSettings();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Ionicons name="hand-right" size={48} color={colors.text} />
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              What should we call you?
            </Text>
            <Text style={[styles.subtext, { color: colors.textSecondary }]}>Stays on this device. There is no account to create.</Text>
          </View>

          <ProfileForm
            initialName=""
            initialAvatar=""
            submitLabel="Continue"
            autoFocus
            onSubmit={async ({ name, avatarId }) => {
              try {
                await setSetting('profileName', name);
                await setSetting('avatarId', avatarId);
                // Flipping this switches the navigator from onboarding to the app (see app/_layout.tsx).
                await setSetting('onboardingComplete', true);
              } catch {
                Alert.alert('Error', 'Your information could not be saved. Please try again.');
              }
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl },
  header: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  title: { fontSize: FontSizes.xxl, fontWeight: '600', textAlign: 'center' },
  subtext: { fontSize: FontSizes.sm, textAlign: 'center' },
});
