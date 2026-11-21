import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ChoiceChips, FieldLabel, FormCard } from '@/components/ui/form';
import { useFormatMoney } from '@/components/ui/Money';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useRepos } from '@/contexts/database-context';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { cancelExternalTrip, expectExternalTrip } from '@/lib/external-trip';
import { log } from '@/lib/logger';
import { ImportPreview, commitImport, previewImport } from '@/services/statement-import';

/** Bank or UPI-app statement (CSV) → preview → import. The file is read on the phone and not kept. */
export default function ImportStatementScreen() {
  const colors = useThemeColors();
  const repos = useRepos();
  const money = useFormatMoney();
  const { resolve } = useCategories();
  const { data: accounts } = useLiveQuery((r) => r.accounts.list());
  const [accountId, setAccountId] = useState('default-bank');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      expectExternalTrip();
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      let text: string;
      try {
        text = await file.text();
      } finally {
        try {
          file.delete();
        } catch {
          // The picker's cache copy is best-effort cleanup.
        }
      }
      setFileName(asset.name);
      setPreview(await previewImport(repos, text, accountId));
    } catch (error) {
      cancelExternalTrip();
      log.error('Statement read failed', error);
      Alert.alert('Couldn’t read that file', error instanceof Error && error.name === 'UnreadableStatementError' ? error.message : 'Choose a CSV statement exported from your bank or UPI app.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview || preview.fresh.length === 0) return;
    setBusy(true);
    try {
      const n = await commitImport(repos, preview.fresh, accountId);
      Alert.alert('Imported', `${n} transaction${n === 1 ? '' : 's'} added.`);
      router.back();
    } catch (error) {
      log.error('Statement import failed', error);
      Alert.alert('Import failed', 'Nothing was added. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const spend = preview?.fresh.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amountPaise, 0) ?? 0;
  const income = preview?.fresh.filter((r) => r.type === 'income').reduce((s, r) => s + r.amountPaise, 0) ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Import statement" leading="close" />
      <ScrollView contentContainerStyle={styles.content}>
        <FormCard>
          <FieldLabel>Import into</FieldLabel>
          <ChoiceChips
            label="Account"
            options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
            value={accountId}
            onChange={(id) => {
              setAccountId(id);
              setPreview(null);
              setFileName(null);
            }}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Export your statement as CSV from your bank’s website or app. The file is read on this phone and deleted right after; payments already in SpentSmart are skipped.
          </Text>
        </FormCard>

        <Button label={fileName ? 'Choose a different file' : 'Choose CSV file'} variant={preview ? 'secondary' : 'primary'} onPress={() => void pick()} loading={busy && !preview} />

        {preview ? (
          <FormCard>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Read columns: {preview.columns.date} · {preview.columns.description} · {preview.columns.amount}
            </Text>
            <Text style={[styles.big, { color: colors.text }]}>{preview.fresh.length} new</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {money(spend)} spent, {money(income)} received
              {preview.duplicates > 0 ? ` · ${preview.duplicates} already recorded, skipped` : ''}
              {preview.skipped.length > 0 ? ` · ${preview.skipped.length} line${preview.skipped.length === 1 ? '' : 's'} couldn’t be read (${preview.skipped.slice(0, 3).map((s) => s.line).join(', ')}${preview.skipped.length > 3 ? '…' : ''})` : ''}
            </Text>
            {preview.fresh.slice(0, 8).map((r) => (
              <View key={r.line} style={[styles.row, { borderTopColor: colors.border }]}>
                <View style={styles.flex}>
                  <Text style={[styles.payee, { color: colors.text }]} numberOfLines={1}>
                    {r.payeeName}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {new Date(r.occurredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {resolve(r.categoryKey).label}
                  </Text>
                </View>
                <Text style={[styles.amount, { color: r.type === 'income' ? colors.success : colors.text }]}>
                  {r.type === 'income' ? '+' : '-'}
                  {money(r.amountPaise)}
                </Text>
              </View>
            ))}
            {preview.fresh.length > 8 ? <Text style={[styles.meta, { color: colors.textSecondary }]}>and {preview.fresh.length - 8} more</Text> : null}
          </FormCard>
        ) : null}

        {preview && preview.fresh.length > 0 ? (
          <Button label={`Import ${preview.fresh.length} transaction${preview.fresh.length === 1 ? '' : 's'}`} onPress={() => void confirm()} loading={busy} />
        ) : preview ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Nothing new to import.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  hint: { fontSize: FontSizes.sm, lineHeight: 20 },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  big: { fontSize: FontSizes.xxl, fontWeight: '800', marginTop: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, borderRadius: BorderRadius.sm },
  payee: { fontSize: FontSizes.md, fontWeight: '600' },
  meta: { fontSize: FontSizes.xs },
  amount: { fontSize: FontSizes.md, fontWeight: '700' },
});
