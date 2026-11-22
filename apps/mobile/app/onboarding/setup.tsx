import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { AmountField, FieldLabel, FormCard, TextField } from '@/components/ui/form';
import { FontSizes, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useSecurity } from '@/contexts/security-context';
import { useSettings } from '@/contexts/settings-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { parsePayday } from '@/lib/payday';
import { parseRupees } from '@spentsmart/finance/money';

type Step = 'payday' | 'budget' | 'lock';
const STEPS: readonly Step[] = ['payday', 'budget', 'lock'];
const ICONS: Record<Step, keyof typeof Ionicons.glyphMap> = { payday: 'calendar', budget: 'pie-chart', lock: 'lock-closed' };
const TITLES: Record<Step, string> = {
  payday: 'When do you get paid?',
  budget: 'Set a monthly budget?',
  lock: 'Lock the app?',
};
const SUBTITLES: Record<Step, string> = {
  payday: 'Home can then count your month from one payday to the next.',
  budget: 'One limit for everything you spend in a month. Category budgets can come later.',
  lock: 'Ask for your fingerprint, face or screen lock whenever SpentSmart opens.',
};

/** Optional setup after the name step. Every step can be skipped and all of it can be changed in Settings. */
export default function OnboardingSetupScreen() {
  const colors = useThemeColors();
  const repos = useRepos();
  const { setSetting } = useSettings();
  const { canUseLock, setBioLockEnabled } = useSecurity();

  const [index, setIndex] = useState(0);
  const [paydayText, setPaydayText] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [busy, setBusy] = useState(false);
  const step = STEPS[index]!;

  const payday = parsePayday(paydayText);
  const budget = parseRupees(budgetText);

  const finish = async () => {
    try {
      // Flipping this switches the navigator from onboarding to the app (see app/_layout.tsx).
      await setSetting('onboardingComplete', true);
    } catch (error) {
      log.error('Finishing onboarding failed', error);
      Alert.alert('Error', 'Setup could not be finished. Please try again.');
    }
  };

  const next = async () => {
    if (index < STEPS.length - 1) setIndex(index + 1);
    else await finish();
  };

  const save = async (task: () => Promise<void>, errorMessage: string) => {
    setBusy(true);
    try {
      await task();
      await next();
    } catch (error) {
      log.error('Onboarding step failed', error);
      Alert.alert('Error', errorMessage);
    } finally {
      setBusy(false);
    }
  };

  const turnOnLock = async () => {
    setBusy(true);
    try {
      const result = await setBioLockEnabled(true);
      if (result.ok) {
        await finish();
        return;
      }
      const reasons = {
        no_hardware: 'This device cannot verify your identity.',
        not_enrolled: 'Set up a fingerprint, face or screen lock in your device settings first.',
        auth_failed: 'Authentication was cancelled, so the lock is still off.',
      } as const;
      Alert.alert('App lock', reasons[result.reason]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.progress, { color: colors.textSecondary }]}>
            Step {index + 2} of {STEPS.length + 1} · optional
          </Text>
          <View style={styles.header}>
            <Ionicons name={ICONS[step]} size={48} color={colors.text} />
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {TITLES[step]}
            </Text>
            <Text style={[styles.subtext, { color: colors.textSecondary }]}>{SUBTITLES[step]}</Text>
          </View>

          {step === 'payday' && (
            <FormCard>
              <FieldLabel>Day of the month</FieldLabel>
              <TextField
                accessibilityLabel="Payday"
                placeholder="e.g. 1 or 25"
                keyboardType="number-pad"
                maxLength={2}
                value={paydayText}
                onChangeText={setPaydayText}
                style={styles.paydayInput}
              />
              {paydayText.trim() !== '' && payday === null ? (
                <Text style={[styles.error, { color: colors.error }]}>Enter a day from 1 to 31</Text>
              ) : null}
            </FormCard>
          )}

          {step === 'budget' && (
            <FormCard>
              <AmountField label="Monthly budget" value={budgetText} onChangeText={setBudgetText} invalid={budgetText.trim() !== '' && budget === null} />
            </FormCard>
          )}

          {step === 'lock' && !canUseLock && (
            <FormCard>
              <Text style={[styles.subtext, { color: colors.textSecondary }]}>
                This phone has no screen lock yet. Set one up in your device settings, then turn this on from Settings.
              </Text>
            </FormCard>
          )}

          <View style={styles.actions}>
            {step === 'payday' && (
              <Button label="Continue" disabled={payday === null} loading={busy} onPress={() => void save(() => setSetting('payday', payday!), 'Your payday could not be saved.')} />
            )}
            {step === 'budget' && (
              <Button
                label="Continue"
                disabled={budget === null}
                loading={busy}
                onPress={() =>
                  void save(async () => {
                    await repos.budgets.set(null, budget!);
                  }, 'Your budget could not be saved.')
                }
              />
            )}
            {step === 'lock' && <Button label="Turn on app lock" disabled={!canUseLock} loading={busy} onPress={() => void turnOnLock()} />}
            <Button label="Skip" variant="ghost" disabled={busy} onPress={() => void next()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, gap: Spacing.lg },
  progress: { fontSize: FontSizes.sm, textAlign: 'center' },
  header: { alignItems: 'center', gap: Spacing.sm },
  title: { fontSize: FontSizes.xxl, fontWeight: '600', textAlign: 'center' },
  subtext: { fontSize: FontSizes.sm, textAlign: 'center' },
  paydayInput: { fontSize: FontSizes.xl, textAlign: 'center' },
  error: { fontSize: FontSizes.xs, textAlign: 'center' },
  actions: { gap: Spacing.sm },
});
