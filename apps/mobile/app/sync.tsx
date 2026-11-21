import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { FieldLabel, FormCard, TextField } from '@/components/ui/form';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useCloud } from '@/contexts/cloud-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { CLOUD_CONFIGURED, TEST_SIGN_IN_BUILD } from '@/lib/cloud-config';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { Device as CloudDevice } from '@/services/cloud/api-client';

const deviceName = () => {
  const c = Platform.constants as { Manufacturer?: string; Model?: string };
  return [c.Manufacturer, c.Model].filter(Boolean).join(' ').slice(0, 60) || 'Android phone';
};
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function SyncScreen() {
  const colors = useThemeColors();
  const { client, cloud, status, syncing, error, refreshStatus, syncNow } = useCloud();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [conflictCount, setConflictCount] = useState(0);

  const loadDetails = useCallback(async () => {
    if (status?.state !== 'ready') return;
    try {
      setDevices(await client.devices());
    } catch {
      // Offline: the list stays as it was.
    }
    setConflictCount((await cloud.conflicts()).length);
  }, [client, cloud, status?.state]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails, syncing]);

  const run = async (task: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      log.warn('Sync screen action failed', e);
      Alert.alert('Couldn’t do that', message(e, fallback));
    } finally {
      setBusy(false);
      await refreshStatus();
    }
  };

  const Header = <ScreenHeader title="Sync & backup" />;

  if (!CLOUD_CONFIGURED) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.content}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>Sync isn’t available in this version of the app yet.</Text>
        </View>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <ActivityIndicator style={styles.loading} color={colors.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      {Header}
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {status.state === 'signed-out' ? (
            <>
              <FormCard>
                <Ionicons name="lock-closed-outline" size={28} color={colors.tint} />
                <Text style={[styles.title, { color: colors.text }]}>End-to-end encrypted</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  Back up your data and use it on another phone. Everything is locked on this phone before it’s sent; the server can’t read your amounts, payees or categories.
                </Text>
              </FormCard>
              <Button label="Sign in with Google" disabled onPress={() => undefined} accessibilityLabel="Sign in with Google, coming soon" />
              <Text style={[styles.hint, { color: colors.textSecondary }]}>Google sign-in is coming soon.</Text>
              {TEST_SIGN_IN_BUILD ? (
                <FormCard>
                  <FieldLabel>Test build: sign in with any name</FieldLabel>
                  <TextField accessibilityLabel="Test account name" value={name} onChangeText={setName} placeholder="e.g. asha" autoCapitalize="none" maxLength={40} />
                  <Button
                    label="Sign in for testing"
                    variant="secondary"
                    loading={busy}
                    disabled={name.trim().length < 2}
                    onPress={() => void run(async () => void (await client.signInForTesting(name.trim(), deviceName())), 'Sign-in failed.')}
                  />
                </FormCard>
              ) : null}
            </>
          ) : null}

          {status.state === 'needs-key' && status.firstDevice && !newRecoveryKey ? (
            <FormCard>
              <Text style={[styles.title, { color: colors.text }]}>Create your recovery key</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Your backup is locked with a key only you have. You’ll need it to restore on a new phone. If you lose it and this phone, the backup can’t be opened by anyone, including us.
              </Text>
              <Button label="Create recovery key" loading={busy} onPress={() => void run(async () => setNewRecoveryKey(await cloud.createKey()), 'Couldn’t set up the backup.')} />
            </FormCard>
          ) : null}

          {newRecoveryKey ? (
            <FormCard>
              <Text style={[styles.title, { color: colors.text }]}>Write this down</Text>
              <Text accessibilityLabel={`Recovery key: ${newRecoveryKey.split('').join(' ')}`} selectable style={[styles.key, { color: colors.text, backgroundColor: colors.surface }]}>
                {newRecoveryKey.split('-').join(' - ')}
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>Keep it somewhere safe and offline. It’s shown only now.</Text>
              <Button
                label="I’ve saved it"
                onPress={() => {
                  setNewRecoveryKey(null);
                  void syncNow();
                }}
              />
            </FormCard>
          ) : null}

          {status.state === 'needs-key' && !status.firstDevice ? (
            <FormCard>
              <Text style={[styles.title, { color: colors.text }]}>Restore your backup</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>Enter the recovery key you saved when you set up sync on your other phone.</Text>
              <TextField
                accessibilityLabel="Recovery key"
                value={recoveryInput}
                onChangeText={setRecoveryInput}
                placeholder="XXXX-XXXX-…"
                autoCapitalize="characters"
                autoCorrect={false}
                multiline
              />
              <Button
                label="Restore"
                loading={busy}
                disabled={recoveryInput.replace(/[\s-]/g, '').length < 54}
                onPress={() =>
                  void run(async () => {
                    await cloud.restoreKey(recoveryInput);
                    setRecoveryInput('');
                    await syncNow();
                  }, 'That key doesn’t open this backup.')
                }
              />
            </FormCard>
          ) : null}

          {status.state === 'ready' && !newRecoveryKey ? (
            <>
              <FormCard>
                <View style={styles.row}>
                  <Ionicons name={error ? 'cloud-offline-outline' : 'cloud-done-outline'} size={24} color={error ? colors.warning : colors.success} />
                  <Text style={[styles.title, styles.flex, { color: colors.text }]}>
                    {syncing ? 'Syncing…' : error ? 'Not synced' : 'Synced'}
                  </Text>
                  {syncing ? <ActivityIndicator color={colors.tint} /> : null}
                </View>
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  {error ?? (status.lastSyncedAt ? `Last synced ${formatDistanceToNow(status.lastSyncedAt, { addSuffix: true })}.` : 'Not synced yet.')}
                </Text>
                <Button label="Sync now" variant="secondary" loading={syncing} onPress={() => void syncNow()} />
              </FormCard>

              {conflictCount > 0 ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`${conflictCount} change${conflictCount === 1 ? '' : 's'} to review`}
                  style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.warning }]}
                  onPress={() => router.push(routes.syncConflicts)}
                >
                  <Ionicons name="git-compare-outline" size={22} color={colors.warning} />
                  <Text style={[styles.flex, styles.bodyStrong, { color: colors.text }]}>
                    {conflictCount} change{conflictCount === 1 ? '' : 's'} edited on two phones — review
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}

              <FormCard>
                <FieldLabel>Phones using this backup</FieldLabel>
                {devices.map((d) => (
                  <View key={d.id} style={[styles.device, { borderTopColor: colors.border }]}>
                    <Ionicons name="phone-portrait-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.flex}>
                      <Text style={[styles.bodyStrong, { color: colors.text }]}>
                        {d.name}
                        {d.current ? ' (this phone)' : ''}
                      </Text>
                      <Text style={[styles.hint, { color: colors.textSecondary }]}>Active {formatDistanceToNow(new Date(d.lastSeenAt), { addSuffix: true })}</Text>
                    </View>
                    {!d.current ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Sign out ${d.name}`}
                        style={styles.deviceAction}
                        onPress={() =>
                          Alert.alert('Sign out that phone?', `${d.name} will stop syncing. Its data stays on it.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Sign out', style: 'destructive', onPress: () => void run(async () => client.removeDevice(d.id).then(loadDetails), 'Couldn’t sign it out.') },
                          ])
                        }
                      >
                        <Text style={{ color: colors.error, fontWeight: '700' }}>Sign out</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </FormCard>

              <Button
                label="Stop syncing on this phone"
                variant="secondary"
                onPress={() =>
                  Alert.alert('Stop syncing?', 'Your data stays on this phone. The backup stays in the cloud for your other phones.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Stop syncing', onPress: () => void run(() => cloud.signOut(false), 'Couldn’t stop syncing.') },
                  ])
                }
              />
              <Button
                label="Delete cloud backup"
                variant="danger"
                onPress={() =>
                  Alert.alert('Delete the cloud backup?', 'This permanently deletes the backup and signs out every phone. Data on your phones is not deleted. This can’t be undone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete backup', style: 'destructive', onPress: () => void run(() => cloud.signOut(true), 'Couldn’t delete the backup.') },
                  ])
                }
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  loading: { marginTop: 80 },
  title: { fontSize: FontSizes.lg, fontWeight: '700' },
  body: { fontSize: FontSizes.sm, lineHeight: 21 },
  bodyStrong: { fontSize: FontSizes.sm, fontWeight: '600' },
  hint: { fontSize: FontSizes.xs },
  key: { fontFamily: 'monospace', fontSize: FontSizes.lg, lineHeight: 30, letterSpacing: 1, padding: Spacing.md, borderRadius: BorderRadius.md, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, minHeight: 48, borderRadius: BorderRadius.lg, borderWidth: 1 },
  device: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm },
  deviceAction: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: Spacing.sm },
});
