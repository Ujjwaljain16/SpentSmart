import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACCOUNT_TYPE_META } from '@/components/accounts/account-meta';
import { Button } from '@/components/ui/Button';
import { AmountField, ChoiceChips, FieldLabel, FormCard, TextField } from '@/components/ui/form';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontSizes, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { paiseToDecimal, parseRupees } from '@spentsmart/finance/money';
import { ACCOUNT_TYPES, AccountType } from '@spentsmart/finance/types';

const showError = (error: unknown, fallback: string) =>
  Alert.alert('Error', error instanceof Error && error.name === 'ValidationError' ? error.message : fallback);

const TYPE_OPTIONS = ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_META[t].label }));

/**
 * People know what their account holds today, not what it held before they started using the app, so the form asks
 * for the current balance and works out the opening balance from what is already recorded.
 */
export default function AccountEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const repos = useRepos();
  const { data: account, loading } = useLiveQuery(async (r) => (id ? ((await r.accounts.list(true)).find((a) => a.id === id) ?? null) : null), [id]);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [balanceText, setBalanceText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    setName(account.name);
    setType(account.type);
    const shown = account.type === 'credit' ? -account.balancePaise : account.balancePaise;
    setBalanceText(shown === 0 ? '' : paiseToDecimal(Math.abs(shown)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const isCredit = type === 'credit';
  // Empty means zero; a real entry must parse.
  const entered = balanceText.trim() === '' ? 0 : parseRupees(balanceText);
  const signed = entered === null ? null : isCredit ? -entered : entered;

  const save = async () => {
    if (signed === null) return Alert.alert('Check the balance', 'Enter an amount like 2500 or 2500.50, or leave it empty.');
    setSaving(true);
    try {
      if (account) {
        const recorded = account.balancePaise - account.openingBalancePaise;
        await repos.accounts.update(account.id, { name, openingBalancePaise: signed - recorded });
      } else {
        await repos.accounts.add({ name, type, openingBalancePaise: signed });
      }
      router.back();
    } catch (error) {
      log.error('Account save failed', error);
      showError(error, 'The account could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const archive = () =>
    Alert.alert('Archive account', 'It disappears from pickers. Its transactions stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await repos.accounts.archive(account!.id);
            router.back();
          } catch (error) {
            showError(error, 'The account could not be archived.');
          }
        },
      },
    ]);

  if (id && !account) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Account" leading="close" />
        {!loading ? <Text style={[styles.hint, styles.center, { color: colors.textSecondary }]}>This account no longer exists.</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={account ? 'Edit account' : 'New account'} leading="close" />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FieldLabel>{isCredit ? 'Amount owed right now' : 'Balance right now'}</FieldLabel>
          <AmountField label={isCredit ? 'Amount owed in rupees' : 'Current balance in rupees'} value={balanceText} onChangeText={setBalanceText} invalid={entered === null} />
          <FormCard>
            <FieldLabel>Name</FieldLabel>
            <TextField accessibilityLabel="Account name" value={name} onChangeText={setName} placeholder="HDFC savings, Paytm wallet…" maxLength={30} />
            {!account ? (
              <>
                <FieldLabel>Type</FieldLabel>
                <ChoiceChips label="Account type" options={TYPE_OPTIONS} value={type} onChange={setType} />
              </>
            ) : null}
          </FormCard>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Only a number you type here. SpentSmart never connects to your bank.
          </Text>
          <Button label="Save" onPress={() => void save()} loading={saving} disabled={!name.trim()} />
          {account ? <Button label="Archive account" variant="danger" onPress={archive} /> : null}
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
  center: { textAlign: 'center', marginTop: Spacing.xl },
});
