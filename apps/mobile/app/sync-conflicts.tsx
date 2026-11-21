import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { FormCard } from '@/components/ui/form';
import { useFormatMoney } from '@/components/ui/Money';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontSizes, Spacing } from '@/constants/theme';
import { useCloud } from '@/contexts/cloud-context';
import { useThemeColors } from '@/hooks/use-theme-colors';

type Conflict = Awaited<ReturnType<ReturnType<typeof useCloud>['cloud']['conflicts']>>[number];

const FIELD_LABEL: Record<string, string> = {
  amount_paise: 'Amount',
  payee_name: 'Name',
  note: 'Note',
  category_key: 'Category',
  occurred_at: 'Date',
  payment_method: 'Paid with',
  account_id: 'Account',
  limit_paise: 'Limit',
  target_paise: 'Target',
  saved_paise: 'Saved',
  name: 'Name',
  label: 'Name',
  tags: 'Tags',
  _deleted: 'Deleted on one phone',
};

/** Changes made to the same thing on two phones before they synced. The value on this phone was kept; choose here. */
export default function SyncConflictsScreen() {
  const colors = useThemeColors();
  const money = useFormatMoney();
  const { cloud, syncNow } = useCloud();
  const [items, setItems] = useState<Conflict[]>([]);

  const load = useCallback(async () => setItems(await cloud.conflicts()), [cloud]);
  useEffect(() => {
    void load();
  }, [load]);

  const show = (field: string, json: string) => {
    const v: unknown = JSON.parse(json);
    if (v === null) return '—';
    if (field === '_deleted') return v ? 'Deleted' : 'Kept';
    if (field.endsWith('_paise') && typeof v === 'number') return money(v);
    if (field === 'occurred_at' && typeof v === 'number') return new Date(v).toLocaleDateString('en-IN');
    return Array.isArray(v) ? v.join(', ') : String(v);
  };

  const resolve = async (id: number, choice: 'keep-mine' | 'use-theirs') => {
    await cloud.resolveConflict(id, choice);
    await load();
    void syncNow();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Review changes" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          These were edited on two phones before they synced. This phone’s version was kept; switch to the other one if that’s the right one.
        </Text>
        {items.length === 0 ? <Text style={[styles.body, { color: colors.textSecondary }]}>Nothing to review.</Text> : null}
        {items.map((c) => (
          <FormCard key={c.id}>
            <Text style={[styles.title, { color: colors.text }]}>
              {c.collection.replace(/s$/, '')} · {FIELD_LABEL[c.field] ?? c.field}
            </Text>
            <Text style={[styles.body, { color: colors.text }]}>This phone: {show(c.field, c.local_json)}</Text>
            <Text style={[styles.body, { color: colors.text }]}>Other phone: {show(c.field, c.remote_json)}</Text>
            <View style={styles.row}>
              <Button style={styles.flex} label="Keep this phone’s" variant="secondary" onPress={() => void resolve(c.id, 'keep-mine')} />
              {c.field !== '_deleted' ? <Button style={styles.flex} label="Use other phone’s" onPress={() => void resolve(c.id, 'use-theirs')} /> : null}
            </View>
          </FormCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  title: { fontSize: FontSizes.md, fontWeight: '700', textTransform: 'capitalize' },
  body: { fontSize: FontSizes.sm, lineHeight: 21 },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
});
