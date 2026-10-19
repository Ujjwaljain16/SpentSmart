import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/settings-context';
import { useThemeColors } from '@/hooks/use-theme-colors';

export default function EditProfileScreen() {
  const colors = useThemeColors();
  const { settings, setSetting } = useSettings();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Edit profile" bordered />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ProfileForm
            initialName={settings.profileName}
            initialAvatar={settings.avatarId}
            submitLabel="Save changes"
            onSubmit={async ({ name, avatarId }) => {
              try {
                await setSetting('profileName', name);
                await setSetting('avatarId', avatarId);
                router.back();
              } catch {
                Alert.alert('Error', 'Your changes could not be saved. Please try again.');
              }
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg },
});
