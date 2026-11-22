import { addMonths, endOfMonth, format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useFormatMoney } from '@/components/ui/Money';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { AmountField, ChoiceChips, FieldLabel, FormCard, TextField } from '@/components/ui/form';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontSizes, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { parseRupees } from '@spentsmart/finance/money';
import { goalMonthlyNeed } from '@spentsmart/finance/safe-to-spend';

const showError = (error: unknown, fallback: string) =>
  Alert.alert('Error', error instanceof Error && error.name === 'ValidationError' ? error.message : fallback);

type Horizon = 'none' | '3' | '6' | '12' | '24';
const HORIZONS: readonly { value: Horizon; label: string }[] = [
  { value: 'none', label: 'No deadline' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '1 year' },
  { value: '24', label: '2 years' },
];

export default function GoalEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <GoalDetail id={id} /> : <NewGoal />;
}

function NewGoal() {
  const colors = useThemeColors();
  const repos = useRepos();
  const money = useFormatMoney();
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('6');
  const [saving, setSaving] = useState(false);
  const amount = parseRupees(amountText);
  // "1 year" means 12 monthly amounts: this month through the end of the 12th.
  const deadline = horizon === 'none' ? null : endOfMonth(addMonths(new Date(), Number(horizon) - 1)).getTime();
  const need = amount !== null ? goalMonthlyNeed({ targetPaise: amount, savedPaise: 0, deadline }, new Date()) : null;

  const save = async () => {
    if (amount === null) return Alert.alert('Target needed', 'Enter how much you want to save.');
    setSaving(true);
    try {
      await repos.goals.add({ name, targetPaise: amount, deadline });
      router.back();
    } catch (error) {
      log.error('Goal save failed', error);
      showError(error, 'The goal could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="New goal" leading="close" />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AmountField label="Target in rupees" value={amountText} onChangeText={setAmountText} invalid={amountText !== '' && amount === null} />
          <FormCard>
            <FieldLabel>What are you saving for?</FieldLabel>
            <TextField accessibilityLabel="Goal name" value={name} onChangeText={setName} placeholder="New phone, trip, emergency fund…" maxLength={40} />
            <FieldLabel>By when</FieldLabel>
            <ChoiceChips label="Deadline" options={HORIZONS} value={horizon} onChange={setHorizon} />
            {need ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                That’s about {money(need)} a month{deadline ? `, done by ${format(deadline, 'MMM yyyy')}` : ''}.
              </Text>
            ) : null}
          </FormCard>
          <Button label="Create goal" onPress={() => void save()} loading={saving} disabled={!name.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function GoalDetail({ id }: { id: string }) {
  const colors = useThemeColors();
  const repos = useRepos();
  const money = useFormatMoney();
  const { data: goal, loading } = useLiveQuery((r) => r.goals.get(id), [id]);
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const amount = parseRupees(amountText);

  const contribute = async (sign: 1 | -1) => {
    if (amount === null) return Alert.alert('Amount needed', 'Enter an amount greater than zero.');
    setBusy(true);
    try {
      await repos.goals.contribute(id, sign * amount);
      setAmountText('');
    } catch (error) {
      showError(error, 'The goal could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const archive = () =>
    Alert.alert('Archive goal', 'The goal will be hidden. Your transactions are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          await repos.goals.archive(id);
          router.back();
        },
      },
    ]);

  if (!goal) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Goal" leading="close" />
        {!loading ? <Text style={[styles.hint, styles.center, { color: colors.textSecondary }]}>This goal no longer exists.</Text> : null}
      </View>
    );
  }

  const percent = goal.targetPaise > 0 ? Math.round((goal.savedPaise / goal.targetPaise) * 100) : 0;
  const need = goalMonthlyNeed(goal, new Date());

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={goal.name} leading="close" />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FormCard>
            <Text style={[styles.big, { color: colors.text }]}>
              {money(goal.savedPaise)} <Text style={[styles.of, { color: colors.textSecondary }]}>of {money(goal.targetPaise)}</Text>
            </Text>
            <ProgressBar percent={percent} color={colors.success} accessibilityLabel={`${percent} percent saved`} />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {need === 0
                ? 'Goal reached.'
                : need
                  ? `Put aside ${money(need)} a month to make it by ${format(goal.deadline!, 'd MMM yyyy')}.`
                  : 'No deadline set.'}
            </Text>
          </FormCard>

          <AmountField label="Amount in rupees" value={amountText} onChangeText={setAmountText} invalid={amountText !== '' && amount === null} />
          <View style={styles.row}>
            <Button style={styles.flex} label="Add money" onPress={() => void contribute(1)} loading={busy} />
            <Button style={styles.flex} label="Take out" variant="secondary" onPress={() => void contribute(-1)} disabled={busy || goal.savedPaise === 0} />
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Goals track money you’ve set aside. They don’t move money between your accounts.
          </Text>
          <Button label="Archive goal" variant="danger" onPress={archive} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.md },
  big: { fontSize: FontSizes.xxl, fontWeight: '800' },
  of: { fontSize: FontSizes.md, fontWeight: '500' },
  hint: { fontSize: FontSizes.sm, lineHeight: 20 },
  center: { textAlign: 'center', marginTop: Spacing.xl },
});
