import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { AmountField, ChoiceChips, FieldLabel, FormCard, TextField } from '@/components/ui/form';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontSizes, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { parseRupees } from '@spentsmart/finance/money';
import { sanitizeText } from '@spentsmart/finance/upi/vpa';

/** Moving money between your own accounts, e.g. an ATM withdrawal (bank → cash). Not counted as spending. */
export default function TransferScreen() {
  const colors = useThemeColors();
  const repos = useRepos();
  const { data: accounts } = useLiveQuery((r) => r.accounts.list());
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accounts || accounts.length < 2 || from !== null) return;
    setFrom(accounts[0]!.id);
    setTo(accounts[1]!.id);
  }, [accounts, from]);

  const options = accounts?.map((a) => ({ value: a.id, label: a.name })) ?? [];
  const amount = parseRupees(amountText);

  const pickFrom = (id: string) => {
    if (id === to) setTo(from);
    setFrom(id);
  };
  const pickTo = (id: string) => {
    if (id === from) setFrom(to);
    setTo(id);
  };

  const save = async () => {
    if (amount === null) return Alert.alert('Amount needed', 'Enter an amount greater than zero.');
    if (!from || !to || from === to) return Alert.alert('Pick two accounts', 'Choose where the money comes from and where it goes.');
    setSaving(true);
    try {
      await repos.transactions.createTransfer({ fromAccountId: from, toAccountId: to, amountPaise: amount, note: sanitizeText(note, 80) || null });
      router.back();
    } catch (error) {
      log.error('Transfer failed', error);
      Alert.alert('Error', error instanceof Error && error.name === 'ValidationError' ? error.message : 'The transfer could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (accounts && accounts.length < 2) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Transfer" leading="close" />
        <View style={styles.content}>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>You need at least two accounts to move money between them.</Text>
          <Button label="Add an account" onPress={() => router.replace(routes.newAccount)} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Transfer" leading="close" />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AmountField label="Amount in rupees" value={amountText} onChangeText={setAmountText} invalid={amountText !== '' && amount === null} autoFocus />
          <FormCard>
            <FieldLabel>From</FieldLabel>
            <ChoiceChips label="From account" options={options} value={from} onChange={pickFrom} />
            <FieldLabel>To</FieldLabel>
            <ChoiceChips label="To account" options={options} value={to} onChange={pickTo} />
            <FieldLabel>Note (optional)</FieldLabel>
            <TextField accessibilityLabel="Note" value={note} onChangeText={setNote} placeholder="ATM withdrawal, card bill…" maxLength={80} />
          </FormCard>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Transfers change account balances but never count as spending or income.</Text>
          <Button label="Save transfer" onPress={() => void save()} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  hint: { fontSize: FontSizes.sm, lineHeight: 20 },
});
