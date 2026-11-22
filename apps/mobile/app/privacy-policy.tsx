import { openURL } from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ISSUES_URL } from '@/constants/app';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

const UPDATED = '22 November 2026';

/** Each section is a heading plus paragraphs; a paragraph starting with "• " is shown as a bullet. */
const SECTIONS: readonly { title: string; body: readonly string[] }[] = [
  {
    title: 'In short',
    body: [
      'SpentSmart keeps your financial data on your phone. Optional features that go further are off until you turn them on: Sync & backup (end-to-end encrypted, so we can’t read it), the Assistant, and automatic logging (which never leaves your phone).',
    ],
  },
  {
    title: 'Data on your phone',
    body: [
      'Transactions, accounts, budgets, goals, categories, tags, your name, avatar and settings are stored only on your device, in an encrypted database (AES-256). The key is made on the phone and kept in the Android Keystore. Android’s automatic cloud backup is turned off for SpentSmart.',
    ],
  },
  {
    title: 'Sync & backup (optional)',
    body: [
      '• You sign in with Google. We receive your Google account ID and email, to tell your phones apart from other people’s. We never see your Google password.',
      '• Your data is encrypted on your phone before it’s sent, with a key only your phones have. A copy of that key is stored on our server locked with your recovery key, which only you have. We can’t read your amounts, payees, notes, categories or dates.',
      '• What our server can see: your Google account ID and email, your phones’ names (like “Pixel 8”), when each last synced, and how many records you have and when they changed.',
      '• If you lose your recovery key and all your signed-in phones, nobody can recover the backup, including us.',
      '• Stop syncing keeps your data on the phone. Delete cloud backup permanently deletes everything we hold about you. It can’t be undone.',
      '• Servers: database on Neon and app server on Render, both in Singapore.',
    ],
  },
  {
    title: 'Assistant (optional)',
    body: [
      '• Your question goes through our server to Anthropic’s Claude model to be answered.',
      '• The model can’t open your database. It asks the app for specific figures, which your phone works out, and only those go back: usually totals, or up to 20 matching transactions when you search.',
      '• Changes it suggests are saved only when you tap Save.',
      '• We don’t store your conversations on our server. Anthropic processes requests under its commercial terms, which don’t allow training on them.',
    ],
  },
  {
    title: 'Automatic logging (optional)',
    body: [
      '• Capture payments: with your permission, SpentSmart looks at notifications from UPI apps, bank apps and your SMS app only. Other apps’ notifications (chats, email, social) are ignored without being read.',
      '• From those apps it keeps only completed payments, and from them only the amount, payee, time, reference and source app. Messages with a one-time password or other code are dropped before anything is saved.',
      '• Captured payments stay on your phone, are never synced, and become transactions only when you add them. Turning it off discards anything not yet reviewed. You can revoke notification access in Android’s settings any time.',
      '• Some builds can also read new incoming SMS for the same purpose, with the same rules. They ask for the SMS permission when you turn capture on, and never read your message inbox.',
      '• Log payments from other apps (beta): when another app asks you to pay with UPI and you choose SpentSmart, it passes the request unchanged to your UPI app, where you pay with your PIN, and records the payee, amount and result. SpentSmart never handles money or your UPI PIN.',
    ],
  },
  {
    title: 'Voice, receipts and statements',
    body: [
      '• Voice: Android’s speech recogniser turns your words into text, on the phone where supported, otherwise through Google’s speech service. SpentSmart doesn’t record or keep audio.',
      '• Receipts: text is read from the photo on your phone. The photo isn’t uploaded or kept.',
      '• Statements: the file you choose is read on your phone and deleted from the app’s storage straight after.',
    ],
  },
  {
    title: 'Permissions',
    body: [
      '• Camera: scanning UPI QR codes and receipt photos.',
      '• Microphone: only while you’re dictating.',
      '• Contacts (read): only the contact you pick as a payee.',
      '• Photos: saving your QR code; choosing a receipt uses Android’s photo picker.',
      '• Notification access: only if you turn on Capture payments.',
      '• Receive SMS (some builds): only if you turn on Capture payments; new messages only.',
      '• Notifications: only if you turn on reminders.',
      '• Internet: Sync & backup, the Assistant and app updates.',
      'SpentSmart can’t read your SMS inbox. It doesn’t access your location, bank accounts or clipboard.',
    ],
  },
  {
    title: 'Other services',
    body: [
      '• Expo, for app updates: technical details like app version and platform.',
      '• UPI apps you pay through receive the payee and amount.',
      '• Google, for sign-in and speech recognition.',
      '• Anthropic, for the Assistant.',
    ],
  },
  {
    title: 'Keeping and deleting',
    body: [
      '• On your phone: until you delete it (Settings → Delete all data) or uninstall. That doesn’t touch the cloud backup.',
      '• On our server: until you delete the cloud backup.',
      '• Server logs hold technical request details, never your financial data, and are kept only as long as our hosting provider retains them.',
    ],
  },
  {
    title: 'Diagnostics',
    body: ['Warnings, errors and the last 20 crashes are kept on the phone with amounts, UPI IDs and emails removed. You can view them in Settings → Diagnostics. Nothing is uploaded.'],
  },
  {
    title: 'Children, changes and contact',
    body: ['SpentSmart isn’t meant for children under 13. Changes to this policy appear here with a new date. Questions or concerns: report them on GitHub.'],
  },
];

export default function PrivacyPolicyScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Privacy policy" bordered />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <Text style={[styles.updated, { color: colors.textSecondary }]}>Last updated {UPDATED}</Text>
        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
              {section.title}
            </Text>
            {section.body.map((line) =>
              line.startsWith('• ') ? (
                <View key={line} style={styles.bulletRow}>
                  <Text style={[styles.body, { color: colors.tint }]}>•</Text>
                  <Text style={[styles.body, styles.flex, { color: colors.text }]}>{line.slice(2)}</Text>
                </View>
              ) : (
                <Text key={line} style={[styles.body, { color: colors.text }]}>
                  {line}
                </Text>
              ),
            )}
          </View>
        ))}
        <Button label="Ask a question on GitHub" variant="secondary" onPress={() => void openURL(ISSUES_URL)} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  updated: { fontSize: FontSizes.sm },
  card: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.sm },
  heading: { fontSize: FontSizes.lg, fontWeight: '700', marginBottom: Spacing.xs },
  body: { fontSize: FontSizes.md, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
});
