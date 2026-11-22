import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { knownAppByPackage } from '@/constants/upi-apps';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useRepos } from '@/contexts/database-context';
import { CapturedPayment } from '@/db/repositories/captured';
import { formatPaise } from '@spentsmart/finance/money';
import { learnCategories } from '@spentsmart/finance/quick-add';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { addCaptured, guessCategory } from '@/services/payment-capture';

const SMS_APPS = new Set(['com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms', 'com.oneplus.mms', 'com.coloros.mms', 'com.truecaller']);

function sourceLabel(c: CapturedPayment): string {
  if (c.source === 'proxy') return 'Paid through SpentSmart';
  if (!c.app) return 'Notification';
  if (SMS_APPS.has(c.app)) return 'Bank SMS';
  return knownAppByPackage(c.app)?.name ?? 'Bank app';
}

/** Payments SpentSmart noticed in notifications, waiting for a yes or no. */
export default function CaptureInboxScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const { categories, resolve } = useCategories();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: items, loading } = useLiveQuery((r) => r.captured.listNew());
  const { data: learned } = useLiveQuery(async (r) => learnCategories((await r.transactions.list({ type: 'expense' }, 500)).items));

  const categoryFor = useMemo(
    () => (c: CapturedPayment) => choices[c.id] ?? guessCategory(c, categories, learned ?? undefined),
    [choices, categories, learned],
  );

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      log.error('Capture inbox action failed', error);
      Alert.alert('Error', 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const add = (c: CapturedPayment) => addCaptured(repos, c, { categoryKey: categoryFor(c), payeeName: c.payeeName ?? (c.direction === 'debit' ? 'Payment' : 'Money received') });
  const list = items ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Captured payments" bordered />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        {!loading && list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.tint} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>New payments from your UPI apps and bank SMS show up here.</Text>
          </View>
        ) : null}

        {list.length > 1 ? (
          <Button
            label={`Add all ${list.length}`}
            loading={busy}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                for (const c of list) await add(c);
              })
            }
          />
        ) : null}

        {list.map((c) => {
          const category = resolve(categoryFor(c));
          const debit = c.direction === 'debit';
          return (
            <View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={[styles.payee, { color: colors.text }]} numberOfLines={1}>
                    {c.payeeName ?? (debit ? 'Unknown payee' : 'Money received')}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {sourceLabel(c)} · {format(c.occurredAt, 'd MMM, h:mm a')}
                    {c.via === 'atm' ? ' · cash withdrawal' : ''}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: debit ? colors.text : colors.success }]}>
                  {debit ? '-' : '+'}
                  {formatPaise(c.amountPaise)}
                </Text>
              </View>

              {c.via !== 'atm' ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Category ${category.label}. Change`}
                  style={[styles.chip, { borderColor: colors.border }]}
                  onPress={() => setEditing(editing === c.id ? null : c.id)}
                >
                  <Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={16} color={category.color} />
                  <Text style={[styles.chipText, { color: colors.text }]}>{category.label}</Text>
                  <Ionicons name={editing === c.id ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
              {editing === c.id ? (
                <CategoryPicker
                  selectedCategory={category.key}
                  onSelectCategory={(key) => {
                    setChoices((m) => ({ ...m, [c.id]: key }));
                    setEditing(null);
                  }}
                  mode="chips"
                  exclude={debit ? ['income'] : []}
                />
              ) : null}

              <View style={styles.row}>
                <Button label="Ignore" variant="secondary" style={styles.flex} disabled={busy} onPress={() => void run(() => repos.captured.ignore(c.id))} />
                <Button label={c.via === 'atm' ? 'Add as cash' : 'Add'} style={styles.flex} disabled={busy} onPress={() => void run(() => add(c))} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700' },
  hint: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex: { flex: 1 },
  payee: { fontSize: FontSizes.lg, fontWeight: '700' },
  meta: { fontSize: FontSizes.sm, marginTop: 2 },
  amount: { fontSize: FontSizes.xl, fontWeight: '800' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  chipText: { fontSize: FontSizes.sm, fontWeight: '600' },
});
