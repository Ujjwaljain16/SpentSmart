import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { openURL } from 'expo-linking';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { ISSUES_URL, PRIVACY_POLICY_URL } from '@/constants/app';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useSecurity } from '@/contexts/security-context';
import { useSettings } from '@/contexts/settings-context';
import { ThemeMode, useTheme } from '@/contexts/theme-context';
import { paiseToDecimal, parseRupees } from '@/domain/money';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getRecentLogs } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { ExportScope, exportCsv, exportPdf } from '@/services/export';
import { setRemindersEnabled } from '@/services/reminders';

const LOCK_TIMEOUTS: readonly { seconds: number; label: string }[] = [
  { seconds: 0, label: 'Immediately' },
  { seconds: 30, label: '30 sec' },
  { seconds: 120, label: '2 min' },
  { seconds: 300, label: '5 min' },
];

const THEMES: readonly { mode: ThemeMode; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { mode: 'light', icon: 'sunny', label: 'Light theme' },
  { mode: 'dark', icon: 'moon', label: 'Dark theme' },
  { mode: 'system', icon: 'phone-portrait', label: 'Follow system theme' },
];

export default function SettingsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const { themeMode, setThemeMode } = useTheme();
  const { settings, setSetting, reload } = useSettings();
  const { isBioLockEnabled, isPrivacyModeEnabled, canUseLock, lockTimeoutSeconds, setBioLockEnabled, setPrivacyModeEnabled, setLockTimeoutSeconds, verifyOwner } = useSecurity();

  const { data: counts } = useLiveQuery(async (r) => ({ transactions: await r.transactions.count(), categories: (await r.categories.list()).length }));
  const [budgetText, setBudgetText] = useState(settings.budgetPaise ? paiseToDecimal(settings.budgetPaise) : '');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setBudgetText(settings.budgetPaise ? paiseToDecimal(settings.budgetPaise) : '');
  }, [settings.budgetPaise]);

  const run = async (key: string, task: () => Promise<void>, errorMessage: string) => {
    setBusy(key);
    try {
      await task();
    } catch {
      Alert.alert('Error', errorMessage);
    } finally {
      setBusy(null);
    }
  };

  const toggleLock = async (enabled: boolean) => {
    const result = await setBioLockEnabled(enabled);
    if (result.ok) return;
    const reasons = {
      no_hardware: 'This device cannot verify your identity.',
      not_enrolled: 'Set up a fingerprint, face or screen lock in your device settings first.',
      auth_failed: 'Authentication was cancelled, so the setting was not changed.',
    } as const;
    Alert.alert('App lock', reasons[result.reason]);
  };

  const toggleReminders = async (enabled: boolean) => {
    const active = await setRemindersEnabled(enabled);
    await setSetting('remindersEnabled', active);
    if (enabled && !active) Alert.alert('Reminders', 'Notifications are turned off for SpentSmart. Enable them in system settings to get reminders.');
  };

  const saveBudget = () =>
    run(
      'budget',
      async () => {
        const trimmed = budgetText.trim();
        if (trimmed === '') {
          await setSetting('budgetPaise', 0);
          Alert.alert('Budget removed', 'You no longer have a monthly budget.');
          return;
        }
        const paise = parseRupees(trimmed);
        if (paise === null) {
          Alert.alert('Invalid amount', 'Enter a budget like 15000 or 15000.50.');
          return;
        }
        await setSetting('budgetPaise', paise);
        Alert.alert('Saved', 'Monthly budget updated.');
      },
      'The budget could not be saved.',
    );

  const chooseScope = (title: string, onChoose: (scope: ExportScope) => void) => {
    const now = new Date();
    Alert.alert(title, 'Which transactions?', [
      { text: 'This month', onPress: () => onChoose({ kind: 'month', date: now }) },
      { text: 'This year', onPress: () => onChoose({ kind: 'year' }) },
      { text: 'Everything', onPress: () => onChoose({ kind: 'all' }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const requireData = (): boolean => {
    if (!counts || counts.transactions === 0) {
      Alert.alert('No data', 'There are no transactions to export.');
      return false;
    }
    return true;
  };

  const eraseEverything = () => {
    Alert.alert(
      'Delete all data',
      'This permanently deletes every transaction, category, setting and pending payment on this device. It cannot be undone. Export first if you want a copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            if (!(await verifyOwner('Confirm to delete all data'))) return;
            await run(
              'erase',
              async () => {
                await repos.eraseEverything();
                await reload();
                Alert.alert('Done', 'All data has been deleted.');
              },
              'Data could not be deleted. Please try again.',
            );
          },
        },
      ],
    );
  };

  const showDiagnostics = () => {
    const logs = getRecentLogs();
    const text = logs.length
      ? logs
          .slice(-15)
          .map((l) => `${new Date(l.at).toLocaleTimeString()} ${l.level.toUpperCase()} ${l.message}`)
          .join('\n')
      : 'No warnings or errors recorded in this session.';
    Alert.alert('Diagnostics (this session)', `${text}\n\nUPI IDs and amounts are removed from these messages. Nothing is sent anywhere.`);
  };

  const Row = ({ icon, title, subtitle, right, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean }) => {
    const content = (
      <>
        <View style={[styles.iconBox, { backgroundColor: danger ? `${colors.error}33` : colors.surface }]}>
          <Ionicons name={icon} size={20} color={danger ? colors.error : colors.tint} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: danger ? colors.error : colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null)}
      </>
    );
    return onPress ? (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} style={styles.row} onPress={onPress}>
        {content}
      </TouchableOpacity>
    ) : (
      <View style={styles.row}>{content}</View>
    );
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );

  const Divider = () => <View style={[styles.divider, { backgroundColor: colors.border }]} />;
  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          Settings
        </Text>

        <Section title="PRIVACY & SECURITY">
          <Row icon="shield-checkmark" title="Privacy dashboard" subtitle="See what is stored and what the app can access" onPress={() => router.push(routes.privacyDashboard)} />
          <Divider />
          <Row
            icon="finger-print"
            title="App lock"
            subtitle={canUseLock ? 'Require fingerprint, face or passcode' : 'Set up a screen lock on this device first'}
            right={<Switch accessibilityLabel="App lock" value={isBioLockEnabled} onValueChange={toggleLock} disabled={!canUseLock && !isBioLockEnabled} trackColor={{ true: colors.tint }} />}
          />
          {isBioLockEnabled && (
            <>
              <Divider />
              <View style={styles.padded}>
                <Text style={[styles.rowSub, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>Lock after leaving the app for</Text>
                <View style={styles.chips}>
                  {LOCK_TIMEOUTS.map((o) => {
                    const active = lockTimeoutSeconds === o.seconds;
                    return (
                      <TouchableOpacity
                        key={o.seconds}
                        accessibilityRole="radio"
                        accessibilityLabel={`Lock after ${o.label}`}
                        accessibilityState={{ selected: active }}
                        style={[styles.chip, { backgroundColor: active ? colors.tint : 'transparent', borderColor: active ? colors.tint : colors.border }]}
                        onPress={() => void setLockTimeoutSeconds(o.seconds)}
                      >
                        <Text style={{ color: active ? colors.onTint : colors.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' }}>{o.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.rowSub, { color: colors.textSecondary, marginTop: Spacing.sm }]}>While the lock is on, screenshots are blocked and the app is hidden in the recent-apps view.</Text>
              </View>
            </>
          )}
          <Divider />
          <Row
            icon="eye-off-outline"
            title="Privacy mode"
            subtitle="Hide amounts everywhere in the app"
            right={<Switch accessibilityLabel="Privacy mode" value={isPrivacyModeEnabled} onValueChange={(v) => void setPrivacyModeEnabled(v)} trackColor={{ true: colors.tint }} />}
          />
        </Section>

        <Section title="REMINDERS">
          <Row
            icon="notifications-outline"
            title="Daily reminders"
            subtitle="10:00 and 20:00, on this device only"
            right={<Switch accessibilityLabel="Daily reminders" value={settings.remindersEnabled} onValueChange={(v) => void toggleReminders(v)} trackColor={{ true: colors.tint }} />}
          />
        </Section>

        <Section title="BUDGET">
          <View style={styles.padded}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Monthly limit (₹)</Text>
            <TextInput
              accessibilityLabel="Monthly budget in rupees"
              style={[styles.budgetInput, { color: colors.text, borderColor: colors.border }]}
              value={budgetText}
              onChangeText={setBudgetText}
              placeholder="e.g. 15000 (leave empty for none)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
            <Button label="Save budget" onPress={() => void saveBudget()} loading={busy === 'budget'} />
          </View>
        </Section>

        <Section title="CATEGORIES">
          <Row icon="pricetags-outline" title="Manage categories" subtitle={`${counts?.categories ?? '—'} configured`} onPress={() => router.push(routes.categoryManager)} />
        </Section>

        <Section title="DATA">
          <Row
            icon="document-text-outline"
            title={busy === 'csv' ? 'Exporting…' : 'Export CSV'}
            subtitle="Spreadsheet-friendly, includes every field"
            onPress={() => requireData() && chooseScope('Export CSV', (scope) => void run('csv', async () => void (await exportCsv(repos, scope)), 'The export failed. Please try again.'))}
          />
          <Divider />
          <Row
            icon="download-outline"
            title={busy === 'pdf' ? 'Exporting…' : 'Export PDF report'}
            subtitle="Printable summary (latest 2,000 rows)"
            onPress={() => requireData() && chooseScope('Export PDF', (scope) => void run('pdf', () => exportPdf(repos, scope), 'The export failed. Please try again.'))}
          />
          <Divider />
          <Row icon="trash-outline" title="Delete all data" subtitle={`${counts?.transactions ?? '—'} transactions stored`} onPress={eraseEverything} danger />
        </Section>

        <Section title="APPEARANCE">
          <View style={styles.themeRow}>
            {THEMES.map((t) => {
              const active = themeMode === t.mode;
              return (
                <TouchableOpacity
                  key={t.mode}
                  accessibilityRole="radio"
                  accessibilityLabel={t.label}
                  accessibilityState={{ selected: active }}
                  style={[styles.themeOption, { backgroundColor: active ? colors.tint : 'transparent', borderColor: active ? colors.tint : colors.border }]}
                  onPress={() => void setThemeMode(t.mode)}
                >
                  <Ionicons name={t.icon} size={20} color={active ? colors.onTint : colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section title="ABOUT">
          <Row icon="information-circle-outline" title="Version" right={<Text style={{ color: colors.textSecondary, fontSize: FontSizes.md }}>{appVersion}</Text>} />
          <Divider />
          <Row icon="document-outline" title="Privacy policy" subtitle="Opens in your browser" onPress={() => void openURL(PRIVACY_POLICY_URL)} />
          <Divider />
          <Row icon="bug-outline" title="Diagnostics" subtitle="Recent warnings, with UPI IDs and amounts removed" onPress={showDiagnostics} />
          <Divider />
          <Row icon="chatbubble-outline" title="Report a problem" subtitle="Opens GitHub issues in your browser" onPress={() => void openURL(ISSUES_URL)} />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },
  title: { fontSize: FontSizes.xxl, fontWeight: '700', marginBottom: Spacing.xl },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSizes.xs, fontWeight: '600', letterSpacing: 1, marginBottom: Spacing.sm, marginLeft: Spacing.xs },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, minHeight: MIN_TOUCH_TARGET + 8, gap: Spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: BorderRadius.sm, justifyContent: 'center', alignItems: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FontSizes.md, fontWeight: '500' },
  rowSub: { fontSize: FontSizes.sm, marginTop: 2 },
  divider: { height: 1 },
  padded: { padding: Spacing.md, gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, minHeight: 40, borderRadius: BorderRadius.full, borderWidth: 1, justifyContent: 'center' },
  budgetInput: { fontSize: FontSizes.lg, fontWeight: '600', paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  themeRow: { flexDirection: 'row', padding: Spacing.sm, gap: Spacing.sm },
  themeOption: { flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, borderWidth: 1 },
});
