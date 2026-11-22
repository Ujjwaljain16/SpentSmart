import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { openURL } from 'expo-linking';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ISSUES_URL } from '@/constants/app';
import { GPAY_PACKAGE } from '@/constants/upi-apps';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useSecurity } from '@/contexts/security-context';
import { useCloud } from '@/contexts/cloud-context';
import { useSettings } from '@/contexts/settings-context';
import { ThemeMode, useTheme } from '@/contexts/theme-context';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { crashLog } from '@/lib/app-crash-log';
import { getRecentLogs } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { ExportScope, exportCsv, exportPdf } from '@/services/export';
import { captureAvailable, captureStatus, openNotificationAccess, proxyEnabled, setCaptureEnabled, setProxy } from '@/services/payment-capture';
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
  const [busy, setBusy] = useState<string | null>(null);
  const { status: cloudStatus } = useCloud();
  const cloudSubtitle =
    cloudStatus?.state === 'ready' ? 'On · end-to-end encrypted' : cloudStatus?.state === 'needs-key' ? 'Finish setting up' : 'Off · back up and use on another phone';
  const [paydayText, setPaydayText] = useState(settings.payday ? String(settings.payday) : '');

  useEffect(() => {
    setPaydayText(settings.payday ? String(settings.payday) : '');
  }, [settings.payday]);

  const savePayday = () => {
    const trimmed = paydayText.trim();
    const day = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isInteger(day) || day < 0 || day > 31) {
      Alert.alert('Payday', 'Enter a day of the month from 1 to 31, or leave it empty.');
      setPaydayText(settings.payday ? String(settings.payday) : '');
      return;
    }
    if (day !== settings.payday) void setSetting('payday', day);
  };

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

  const [capture, setCapture] = useState({ enabled: false, accessGranted: false });
  const [proxyOn, setProxyOn] = useState(false);
  const refreshCapture = useCallback(async () => {
    setCapture(await captureStatus());
    setProxyOn(await proxyEnabled());
  }, []);
  // Notification access is granted in system settings, so re-check whenever the user comes back.
  useEffect(() => {
    void refreshCapture();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void refreshCapture());
    return () => sub.remove();
  }, [refreshCapture]);

  const toggleCapture = async (enabled: boolean) => {
    if (!enabled) {
      await setCaptureEnabled(false);
      return refreshCapture();
    }
    Alert.alert(
      'Capture payments',
      'SpentSmart will look at notifications from UPI apps, bank apps and your SMS app only, and keep just the amount, payee and time of completed payments. Messages with a code (OTPs) are dropped without being saved. Nothing leaves your phone, and every payment waits for you to add it.\n\nAndroid will ask you to allow notification access.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () =>
            void (async () => {
              await setCaptureEnabled(true);
              const status = await captureStatus();
              setCapture(status);
              if (!status.accessGranted) await openNotificationAccess();
            })(),
        },
      ],
    );
  };

  const toggleProxy = async (enabled: boolean) => {
    if (!enabled) {
      await setProxy(false, null);
      return refreshCapture();
    }
    Alert.alert(
      'Log payments from other apps',
      'When Zomato, Zepto or a website says “Pay with UPI”, you can pick SpentSmart. It passes the payment to your UPI app unchanged, where you pay with your PIN as usual, and logs it when the UPI app confirms.\n\nSpentSmart never handles money. This is an experiment: some checkouts only list certain apps.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Turn on',
          onPress: () =>
            void (async () => {
              await setProxy(true, GPAY_PACKAGE);
              await refreshCapture();
            })(),
        },
      ],
    );
  };

  const toggleReminders = async (enabled: boolean) => {
    const active = await setRemindersEnabled(enabled);
    await setSetting('remindersEnabled', active);
    if (enabled && !active) Alert.alert('Reminders', 'Notifications are turned off for SpentSmart. Enable them in system settings to get reminders.');
  };

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
    const crashes = crashLog.list();
    const crashText = crashes.length
      ? `\n\nEarlier crashes (kept on this phone):\n${crashes
          .slice(-5)
          .map((c) => `${new Date(c.at).toLocaleString()} ${c.message.split('\n')[0]}`)
          .join('\n')}`
      : '';
    Alert.alert('Diagnostics', `${text}${crashText}\n\nUPI IDs, amounts and emails are removed. Nothing is sent anywhere.`, [
      ...(crashes.length ? [{ text: 'Clear crashes', onPress: () => crashLog.clear() }] : []),
      { text: 'OK' },
    ]);
  };

  const Row = ({
    icon,
    title,
    subtitle,
    right,
    onPress,
    danger,
    toggle,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
    onPress?: () => void;
    danger?: boolean;
    /** A switch row: the whole row is the touch target and reads as one switch to TalkBack. */
    toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  }) => {
    const content = (
      <>
        <View style={[styles.iconBox, { backgroundColor: danger ? `${colors.error}33` : colors.surface }]}>
          <Ionicons name={icon} size={20} color={danger ? colors.error : colors.tint} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: danger ? colors.error : colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {toggle ? (
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
            <Switch value={toggle.value} disabled={toggle.disabled} trackColor={{ true: colors.tint }} />
          </View>
        ) : (
          right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null)
        )}
      </>
    );
    if (toggle) {
      return (
        <TouchableOpacity
          accessibilityRole="switch"
          accessibilityLabel={title}
          accessibilityHint={subtitle}
          accessibilityState={{ checked: toggle.value, disabled: !!toggle.disabled }}
          disabled={toggle.disabled}
          style={styles.row}
          onPress={() => toggle.onChange(!toggle.value)}
        >
          {content}
        </TouchableOpacity>
      );
    }
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
            toggle={{ value: isBioLockEnabled, onChange: (v) => void toggleLock(v), disabled: !canUseLock && !isBioLockEnabled }}
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
            toggle={{ value: isPrivacyModeEnabled, onChange: (v) => void setPrivacyModeEnabled(v) }}
          />
        </Section>

        <Section title="REMINDERS">
          <Row
            icon="notifications-outline"
            title="Daily reminders"
            subtitle="10:00 and 20:00, on this device only"
            toggle={{ value: settings.remindersEnabled, onChange: (v) => void toggleReminders(v) }}
          />
        </Section>

        {captureAvailable ? (
          <Section title="AUTOMATIC LOGGING">
            <Row
              icon="flash-outline"
              title="Capture payments"
              subtitle={
                !capture.enabled
                  ? 'Off · read payment alerts from UPI apps and bank SMS'
                  : capture.accessGranted
                    ? 'On · new payments wait for you to add them'
                    : 'Needs notification access · tap to allow'
              }
              toggle={{ value: capture.enabled, onChange: (v) => void toggleCapture(v) }}
            />
            {capture.enabled && !capture.accessGranted ? (
              <>
                <Divider />
                <Row icon="key-outline" title="Allow notification access" subtitle="Android asks once; you can turn it off there any time" onPress={() => void openNotificationAccess()} />
              </>
            ) : null}
            <Divider />
            <Row icon="file-tray-full-outline" title="Captured payments" subtitle="Review, add or ignore" onPress={() => router.push(routes.captureInbox)} />
            <Divider />
            <Row
              icon="git-network-outline"
              title="Log payments from other apps (beta)"
              subtitle={proxyOn ? 'On · SpentSmart appears in “Pay with UPI” lists' : 'Off · for Zomato, Zepto and other checkouts'}
              toggle={{ value: proxyOn, onChange: (v) => void toggleProxy(v) }}
            />
          </Section>
        ) : null}

        <Section title="SYNC & LABS">
          <Row icon="cloud-outline" title="Sync & backup" subtitle={cloudSubtitle} onPress={() => router.push(routes.sync)} />
          <Divider />
          <Row
            icon="sparkles-outline"
            title="Assistant (lab)"
            subtitle="Ask questions about your money. Needs Sync & backup sign-in."
            toggle={{ value: settings.assistantEnabled, onChange: (v) => void setSetting('assistantEnabled', v) }}
          />
        </Section>

        <Section title="MONEY">
          <Row icon="pie-chart-outline" title="Budgets & goals" subtitle="Monthly limits, category budgets, savings goals" onPress={() => router.push(routes.budgets)} />
          <Divider />
          <Row icon="wallet-outline" title="Accounts" subtitle="Bank, cash, wallets and their balances" onPress={() => router.push(routes.accounts)} />
          <Divider />
          <Row
            icon="calendar-outline"
            title="Payday"
            subtitle="Day of the month your income arrives. Safe to spend lasts until then."
            right={
              <TextInput
                accessibilityLabel="Payday, day of the month"
                style={[styles.paydayInput, { color: colors.text, borderColor: colors.border }]}
                value={paydayText}
                onChangeText={setPaydayText}
                onEndEditing={savePayday}
                placeholder="—"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={2}
              />
            }
          />
        </Section>

        <Section title="CATEGORIES">
          <Row icon="pricetags-outline" title="Manage categories" subtitle={`${counts?.categories ?? '—'} configured`} onPress={() => router.push(routes.categoryManager)} />
        </Section>

        <Section title="DATA">
          <Row icon="cloud-download-outline" title="Import bank statement" subtitle="CSV from your bank or UPI app; duplicates are skipped" onPress={() => router.push(routes.importStatement)} />
          <Divider />
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
          <Row icon="document-outline" title="Privacy policy" subtitle="What SpentSmart keeps, and where" onPress={() => router.push(routes.privacyPolicy)} />
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
  paydayInput: { fontSize: FontSizes.lg, fontWeight: '600', minWidth: 48, minHeight: MIN_TOUCH_TARGET, textAlign: 'center', borderBottomWidth: 1 },
  themeRow: { flexDirection: 'row', padding: Spacing.sm, gap: Spacing.sm },
  themeOption: { flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, borderWidth: 1 },
});
