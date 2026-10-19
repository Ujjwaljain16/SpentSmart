import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useSettings } from '@/contexts/settings-context';
import { INCOME_CATEGORY_KEY } from '@/domain/categories';
import { formatPaise, parseRupees } from '@/domain/money';
import { buildPayUri } from '@/domain/upi/build';
import { isValidVpa, normalizeVpa, sanitizeText } from '@/domain/upi/vpa';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';

export default function ReceiveScreen() {
  const colors = useThemeColors();
  const repos = useRepos();
  const { settings, setSetting } = useSettings();

  const [editingProfile, setEditingProfile] = useState(!settings.myVpa);
  const [vpaText, setVpaText] = useState(settings.myVpa);
  const [nameText, setNameText] = useState(settings.myPayName || settings.profileName);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');

  const amount = parseRupees(amountText);
  const amountInvalid = amountText.trim() !== '' && amount === null;
  const vpaInvalid = vpaText.trim() !== '' && !isValidVpa(vpaText);

  const saveProfile = async () => {
    if (!isValidVpa(vpaText)) {
      Alert.alert('Check your UPI ID', 'It should look like name@bank.');
      return;
    }
    try {
      await setSetting('myVpa', normalizeVpa(vpaText));
      await setSetting('myPayName', sanitizeText(nameText, 60) || 'Me');
      setEditingProfile(false);
    } catch {
      Alert.alert('Error', 'Your UPI profile could not be saved.');
    }
  };

  const uri = settings.myVpa
    ? buildPayUri({ vpa: settings.myVpa, payeeName: settings.myPayName || 'Me', amountPaise: amount ?? undefined, note: sanitizeText(note, 80) || undefined })
    : '';

  const share = async () => {
    try {
      await Share.share({ message: `Pay me ${amount ? formatPaise(amount) : ''} on UPI: ${uri}`.replace('  ', ' ') });
    } catch (error) {
      log.warn('Share cancelled or failed', error);
    }
  };

  const recordIncome = () => {
    Alert.alert('Record income', 'Did you receive this payment?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, record it',
        onPress: async () => {
          if (amount === null) {
            Alert.alert('Enter an amount', 'Enter the amount you received first.');
            return;
          }
          try {
            await repos.transactions.insert({
              amountPaise: amount,
              type: 'income',
              categoryKey: INCOME_CATEGORY_KEY,
              payeeName: 'Received',
              paymentMethod: 'upi',
              note: sanitizeText(note, 80) || null,
              verifiedBy: 'manual',
            });
            router.replace(routes.home);
          } catch (error) {
            log.error('Recording income failed', error);
            Alert.alert('Error', 'The income could not be saved.');
          }
        },
      },
    ]);
  };

  const field = [styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={editingProfile ? 'Your UPI details' : 'Receive money'} leading="close" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {editingProfile ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Your UPI ID</Text>
              <TextInput accessibilityLabel="Your UPI ID" style={[...field, vpaInvalid && { borderColor: colors.error }]} value={vpaText} onChangeText={setVpaText} placeholder="username@bank" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false} />
              {vpaInvalid ? <Text style={{ color: colors.error, fontSize: FontSizes.xs }}>That doesn’t look like a UPI ID (name@bank).</Text> : null}
              <Text style={[styles.label, { color: colors.textSecondary }]}>Name shown to payers</Text>
              <TextInput accessibilityLabel="Your name" style={field} value={nameText} onChangeText={setNameText} placeholder="Your name" placeholderTextColor={colors.textSecondary} maxLength={60} />
              <Button label="Continue" onPress={() => void saveProfile()} />
            </>
          ) : (
            <>
              <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Amount to request (optional)</Text>
                <View style={styles.amountRow}>
                  <Text style={[styles.currency, { color: colors.text }]}>₹</Text>
                  <TextInput accessibilityLabel="Amount to request in rupees" style={[styles.amountInput, { color: colors.text }]} value={amountText} onChangeText={setAmountText} placeholder="0" placeholderTextColor={colors.textSecondary} keyboardType="decimal-pad" />
                </View>
                {amountInvalid ? <Text style={{ color: colors.error, fontSize: FontSizes.xs }}>Enter an amount like 250 or 250.50</Text> : null}
              </View>

              <TextInput accessibilityLabel="Note" style={field} value={note} onChangeText={setNote} placeholder="What’s this for? (optional)" placeholderTextColor={colors.textSecondary} maxLength={80} />

              <View style={styles.qrBox}>
                <View style={styles.qrWrap}>
                  <QRCode value={uri || 'upi://pay'} size={200} color="#000000" backgroundColor="#FFFFFF" />
                </View>
                <Text style={[styles.vpa, { color: colors.text }]} selectable>
                  {settings.myVpa}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: FontSizes.sm }}>{settings.myPayName}</Text>
              </View>

              <Button label="Share payment link" onPress={() => void share()} disabled={amountInvalid} />
              <Button label="I received it — record income" variant="secondary" onPress={recordIncome} disabled={amount === null} />
              <Button label="Change my UPI ID" variant="ghost" onPress={() => setEditingProfile(true)} />
              <View style={styles.hint}>
                <Ionicons name="shield-checkmark" size={16} color={colors.tint} />
                <Text style={[styles.hintText, { color: colors.textSecondary }]}>The QR code is generated on your phone. SpentSmart can’t see incoming payments, so record them yourself.</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  label: { fontSize: FontSizes.sm },
  input: { minHeight: 48, borderRadius: BorderRadius.md, borderWidth: 1, paddingHorizontal: Spacing.md, fontSize: FontSizes.md },
  amountCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, alignItems: 'center', gap: Spacing.xs },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  currency: { fontSize: 32, fontWeight: '700', marginRight: 4 },
  amountInput: { fontSize: 48, fontWeight: '700', minWidth: 100, textAlign: 'center' },
  qrBox: { alignItems: 'center', gap: 4, marginVertical: Spacing.md },
  qrWrap: { backgroundColor: '#FFFFFF', padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm },
  vpa: { fontSize: FontSizes.md, fontWeight: '600' },
  hint: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  hintText: { flex: 1, fontSize: FontSizes.xs },
});
