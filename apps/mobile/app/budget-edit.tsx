import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { Button } from '@/components/ui/Button';
import { AmountField, FieldLabel, FormCard } from '@/components/ui/form';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useRepos } from '@/contexts/database-context';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { INCOME_CATEGORY_KEY, TRANSFER_CATEGORY_KEY } from '@spentsmart/finance/categories';
import { paiseToDecimal, parseRupees } from '@spentsmart/finance/money';

const showError = (error: unknown, fallback: string) =>
  Alert.alert('Error', error instanceof Error && error.name === 'ValidationError' ? error.message : fallback);

export default function BudgetEditScreen() {
  const params = useLocalSearchParams<{ overall?: string; category?: string }>();
  const colors = useThemeColors();
  const repos = useRepos();
  const { categories, resolve } = useCategories();
  const isNew = !params.overall && !params.category;
  const fixedKey: string | null | undefined = params.overall ? null : params.category;

  const [categoryKey, setCategoryKey] = useState<string | null>(fixedKey ?? null);
  const [amountText, setAmountText] = useState('');
  const [rollover, setRollover] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: active } = useLiveQuery((r) => r.budgets.listActive());
  const existing = active?.find((b) => b.categoryKey === (isNew ? categoryKey : fixedKey)) ?? null;
  const takenKeys = useMemo(() => active?.map((b) => b.categoryKey).filter((k): k is string => k !== null) ?? [], [active]);

  useEffect(() => {
    if (!existing) return;
    setAmountText(paiseToDecimal(existing.limitPaise));
    setRollover(existing.rollover);
    // Load once per budget, not on every live refresh, so typing isn't overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  useEffect(() => {
    if (!isNew || categoryKey !== null) return;
    const first = categories.find((c) => c.key !== INCOME_CATEGORY_KEY && c.key !== TRANSFER_CATEGORY_KEY && !takenKeys.includes(c.key));
    if (first) setCategoryKey(first.key);
  }, [isNew, categoryKey, categories, takenKeys]);

  const amount = parseRupees(amountText);
  const title = fixedKey === null ? 'Monthly budget' : fixedKey ? `${resolve(fixedKey).label} budget` : 'New category budget';

  const save = async () => {
    if (amount === null) {
      Alert.alert('Amount needed', 'Enter a limit greater than zero.');
      return;
    }
    if (isNew && categoryKey === null) {
      Alert.alert('Pick a category', 'Choose which category this budget is for.');
      return;
    }
    setSaving(true);
    try {
      await repos.budgets.set(isNew ? categoryKey : fixedKey!, amount, rollover);
      router.back();
    } catch (error) {
      log.error('Budget save failed', error);
      showError(error, 'The budget could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Remove budget', 'Spending stays recorded; only the limit goes away.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await repos.budgets.remove(fixedKey ?? null);
            router.back();
          } catch (error) {
            showError(error, 'The budget could not be removed.');
          }
        },
      },
    ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={title} leading="close" />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AmountField label="Monthly limit in rupees" value={amountText} onChangeText={setAmountText} invalid={amountText !== '' && amount === null} autoFocus={!isNew} />

          {isNew ? (
            <FormCard>
              <FieldLabel>Category</FieldLabel>
              <CategoryPicker selectedCategory={categoryKey} onSelectCategory={setCategoryKey} mode="list" exclude={[INCOME_CATEGORY_KEY, ...takenKeys]} />
            </FormCard>
          ) : null}

          <FormCard>
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={[styles.switchTitle, { color: colors.text }]}>Carry over what’s left</Text>
                <Text style={[styles.switchSub, { color: colors.textSecondary }]}>Unspent money from last month is added to this month’s limit.</Text>
              </View>
              <Switch accessibilityLabel="Carry over unspent budget" value={rollover} onValueChange={setRollover} trackColor={{ true: colors.tint }} />
            </View>
          </FormCard>

          <Button label="Save budget" onPress={() => void save()} loading={saving} />
          {!isNew && existing ? <Button label="Remove budget" variant="danger" onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  switchTitle: { fontSize: FontSizes.md, fontWeight: '600' },
  switchSub: { fontSize: FontSizes.sm, marginTop: 2 },
});
