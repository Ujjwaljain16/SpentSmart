import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useSecurity } from '@/contexts/security-context';
import { useSettings } from '@/contexts/settings-context';
import { formatBytes } from '@/domain/format';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';

type IconName = keyof typeof Ionicons.glyphMap;

const ACCESS: readonly { icon: IconName; name: string; detail: string }[] = [
  { icon: 'camera', name: 'Camera', detail: 'Only while the scanner is open, to read UPI QR codes. Images are never saved or sent.' },
  { icon: 'people', name: 'Contacts', detail: 'Only when you tap “Pick contact”. SpentSmart reads just the name of the contact you choose and stores nothing else.' },
  { icon: 'notifications', name: 'Notifications', detail: 'Optional. Used only for the daily reminders you can switch on in Settings.' },
  { icon: 'images', name: 'Photos (save only)', detail: 'Only when you save a QR code to your gallery. SpentSmart cannot read your photos.' },
  { icon: 'finger-print', name: 'Biometrics', detail: 'Optional app lock. Your fingerprint or face is handled by Android and never reaches SpentSmart.' },
];

const NEVER: readonly string[] = [
  'Your SMS messages',
  'Your location',
  'Your clipboard',
  'Your bank accounts',
  'Analytics, ads or tracking SDKs',
  'Any server that stores your transactions',
];

export default function PrivacyDashboardScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const { settings, reload } = useSettings();
  const { isBioLockEnabled, verifyOwner } = useSecurity();
  const { data: stats } = useLiveQuery((r) => r.storageStats());

  const erase = () => {
    Alert.alert('Delete all data', 'This permanently deletes every transaction, category and setting on this device. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: async () => {
          if (!(await verifyOwner('Confirm to delete all data'))) return;
          try {
            await repos.eraseEverything();
            await reload();
            Alert.alert('Done', 'All data has been deleted.');
          } catch {
            Alert.alert('Error', 'Data could not be deleted. Please try again.');
          }
        },
      },
    ]);
  };

  const Card = ({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={20} color={colors.tint} />
        <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.statRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Privacy dashboard" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.shield, { backgroundColor: colors.card }]}>
            <Ionicons name="shield-checkmark" size={56} color={colors.tint} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Your data stays on this phone</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>Stored in an encrypted database. There is no account and no SpentSmart server.</Text>
        </View>

        <Card title="Profile" icon="person-circle">
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
              <Ionicons name={settings.avatarId as IconName} size={30} color={colors.text} />
            </View>
            <Text style={[styles.profileName, { color: colors.text }]}>{settings.profileName || 'No name set'}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => router.push(routes.editProfile)} style={styles.editButton}>
              <Text style={{ color: colors.tint, fontWeight: '600' }}>Edit</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Card title="What is stored" icon="document-text">
          <Stat label="Transactions" value={String(stats?.transactions ?? '—')} />
          <Stat label="Categories" value={String(stats?.categories ?? '—')} />
          <Stat label="Database size" value={stats ? formatBytes(stats.bytes) : '—'} />
          {stats?.oldest ? <Stat label="First record" value={format(new Date(stats.oldest), 'd MMM yyyy')} /> : null}
          {stats?.newest ? <Stat label="Latest record" value={format(new Date(stats.newest), 'd MMM yyyy')} /> : null}
          <Stat label="Encryption" value="AES-256 (SQLCipher)" />
          <Stat label="App lock" value={isBioLockEnabled ? 'On' : 'Off'} />
        </Card>

        <Card title="What the app can access" icon="lock-closed">
          {ACCESS.map((a) => (
            <View key={a.name} style={styles.accessRow}>
              <Ionicons name={a.icon} size={20} color={colors.textSecondary} />
              <View style={styles.flex}>
                <Text style={[styles.accessName, { color: colors.text }]}>{a.name}</Text>
                <Text style={[styles.accessDetail, { color: colors.textSecondary }]}>{a.detail}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card title="What it never touches" icon="close-circle">
          {NEVER.map((n) => (
            <View key={n} style={styles.neverRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={[styles.neverText, { color: colors.text }]}>{n}</Text>
            </View>
          ))}
          <Text style={[styles.footnote, { color: colors.textSecondary }]}>
            The only network activity is the app-update check run by Expo, which does not include your transactions. Payments themselves happen inside your UPI app, not SpentSmart.
          </Text>
        </Card>

        <View style={[styles.danger, { backgroundColor: `${colors.error}1A`, borderColor: `${colors.error}55` }]}>
          <Text style={[styles.dangerTitle, { color: colors.error }]} accessibilityRole="header">
            Danger zone
          </Text>
          <Text style={[styles.footnote, { color: colors.textSecondary }]}>Deleting removes every transaction, category, setting and pending payment. Export a CSV first if you want a copy.</Text>
          <Button label="Delete all data" variant="danger" onPress={erase} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  hero: { alignItems: 'center', gap: Spacing.sm },
  shield: { width: 112, height: 112, borderRadius: 56, justifyContent: 'center', alignItems: 'center' },
  heroTitle: { fontSize: FontSizes.xxl, fontWeight: '700', textAlign: 'center' },
  heroSub: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20 },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  cardTitle: { fontSize: FontSizes.md, fontWeight: '600' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  profileName: { flex: 1, fontSize: FontSizes.lg, fontWeight: '600' },
  editButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  statLabel: { fontSize: FontSizes.md },
  statValue: { fontSize: FontSizes.md, fontWeight: '600' },
  accessRow: { flexDirection: 'row', gap: Spacing.md, paddingVertical: 6 },
  accessName: { fontSize: FontSizes.md, fontWeight: '500' },
  accessDetail: { fontSize: FontSizes.sm, lineHeight: 19 },
  neverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  neverText: { fontSize: FontSizes.md },
  footnote: { fontSize: FontSizes.sm, lineHeight: 19, marginTop: Spacing.xs },
  danger: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  dangerTitle: { fontSize: FontSizes.lg, fontWeight: '600' },
});
