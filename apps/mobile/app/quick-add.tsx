import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useFormatMoney } from '@/components/ui/Money';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useRepos } from '@/contexts/database-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { scanReceipt, useVoiceCapture } from '@/services/capture';
import { learnCategories, parseQuickAdd } from '@spentsmart/finance/quick-add';
import { useLiveQuery } from '@/hooks/use-live-query';
import { TransactionSource } from '@spentsmart/finance/types';
import { sanitizeText } from '@spentsmart/finance/upi/vpa';

const EXAMPLES = ['swiggy 340 dinner', 'auto 80 cash', 'salary 50k yesterday', 'amazon refund 499', 'chai 20 #office'];

const METHOD_LABEL = { upi: 'UPI', cash: 'Cash', bank: 'Bank', other: 'Card / other' } as const;
const TYPE_LABEL = { expense: 'Expense', income: 'Income', refund: 'Refund' } as const;

function dayLabel(ms: number): string {
  if (isToday(ms)) return 'Today';
  if (isYesterday(ms)) return 'Yesterday';
  return format(ms, 'EEE d MMM');
}

/** Type a phrase, see exactly how it was understood, save. Everything is parsed on the phone. */
export default function QuickAddScreen() {
  const colors = useThemeColors();
  const repos = useRepos();
  const money = useFormatMoney();
  const { categories, resolve } = useCategories();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  // Where the phrase came from; typing over a spoken or scanned phrase keeps its origin.
  const [source, setSource] = useState<TransactionSource>('quick_add');
  const [scanning, setScanning] = useState(false);
  const voice = useVoiceCapture((spoken) => {
    setText(spoken);
    setSource('voice');
  });
  // The home-screen widget's "Speak" button opens this screen already listening.
  const { voice: startListening } = useLocalSearchParams<{ voice?: string }>();
  const voiceStart = voice.start;
  useEffect(() => {
    if (startListening === '1') void voiceStart();
  }, [startListening, voiceStart]);

  const scan = (from: 'camera' | 'gallery') => async () => {
    setScanning(true);
    try {
      const result = await scanReceipt(from);
      if (!result) return;
      setText(result.phrase);
      setSource('ocr');
      if (!result.foundAmount) Alert.alert('Couldn’t find the total', 'Type the amount into the phrase.');
    } catch (e) {
      log.warn('Receipt scan failed', e);
      Alert.alert('Couldn’t read the receipt', e instanceof Error ? e.message : 'Try a clearer photo, or type it instead.');
    } finally {
      setScanning(false);
    }
  };

  // The user's own past filing teaches the parser payees no dictionary knows.
  const { data: learned } = useLiveQuery(async (r) => learnCategories((await r.transactions.list({ type: 'expense' }, 500)).items));
  const draft = useMemo(() => (text.trim() ? parseQuickAdd(text, categories, new Date(), { learned }) : null), [text, categories, learned]);
  const ready = draft !== null && draft.amountPaise !== null;

  const save = async () => {
    if (!draft || draft.amountPaise === null) return;
    setSaving(true);
    try {
      await repos.transactions.insert({
        amountPaise: draft.amountPaise,
        type: draft.type,
        categoryKey: draft.categoryKey,
        payeeName: sanitizeText(draft.payeeName, 60) || TYPE_LABEL[draft.type],
        paymentMethod: draft.paymentMethod,
        note: draft.note ? sanitizeText(draft.note, 80) || null : null,
        occurredAt: draft.occurredAt,
        verifiedBy: 'manual',
        source,
        tags: draft.tags,
      });
      router.back();
    } catch (error) {
      log.error('Quick add failed', error);
      Alert.alert('Error', error instanceof Error && error.name === 'ValidationError' ? error.message : 'The transaction could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) => (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Quick add" leading="close" />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextInput
            accessibilityLabel="Describe the transaction"
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
            value={text}
            onChangeText={setText}
            placeholder="swiggy 340 dinner"
            placeholderTextColor={colors.textSecondary}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => ready && void save()}
            maxLength={160}
          />

          <View style={styles.captureRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={voice.listening ? 'Stop listening' : 'Speak the transaction'}
              style={[styles.capture, { backgroundColor: voice.listening ? colors.error : colors.card, borderColor: colors.border }]}
              onPress={() => (voice.listening ? voice.stop() : void voice.start())}
            >
              <Ionicons name={voice.listening ? 'stop' : 'mic-outline'} size={20} color={voice.listening ? colors.onTint : colors.tint} />
              <Text style={[styles.captureText, { color: voice.listening ? colors.onTint : colors.text }]}>{voice.listening ? 'Listening…' : 'Speak'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Scan a receipt"
              disabled={scanning}
              style={[styles.capture, { backgroundColor: colors.card, borderColor: colors.border, opacity: scanning ? 0.5 : 1 }]}
              onPress={() =>
                Alert.alert('Scan a receipt', 'Read the total, shop and date from a bill. The photo stays on this phone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Choose photo', onPress: () => void scan('gallery')() },
                  { text: 'Take photo', onPress: () => void scan('camera')() },
                ])
              }
            >
              <Ionicons name="receipt-outline" size={20} color={colors.tint} />
              <Text style={[styles.captureText, { color: colors.text }]}>{scanning ? 'Reading…' : 'Scan receipt'}</Text>
            </TouchableOpacity>
          </View>
          {voice.error ? <Text style={[styles.hint, { color: colors.warning }]}>{voice.error}</Text> : null}

          {draft ? (
            <View style={[styles.preview, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text
                style={[styles.amount, { color: draft.amountPaise === null ? colors.textSecondary : draft.type === 'expense' ? colors.text : colors.success }]}
              >
                {draft.amountPaise === null ? 'Add an amount' : `${draft.type === 'expense' ? '' : '+'}${money(draft.amountPaise)}`}
              </Text>
              <Row icon="swap-vertical-outline" label="Type" value={TYPE_LABEL[draft.type]} />
              <Row icon="person-outline" label={draft.type === 'income' ? 'From' : 'To'} value={draft.payeeName} />
              <Row icon="pricetag-outline" label="Category" value={resolve(draft.categoryKey).label} />
              <Row icon="calendar-outline" label="When" value={dayLabel(draft.occurredAt)} />
              <Row icon="card-outline" label="Paid with" value={METHOD_LABEL[draft.paymentMethod]} />
              {draft.note ? <Row icon="document-text-outline" label="Note" value={draft.note} /> : null}
              {draft.tags.length > 0 ? <Row icon="pricetags-outline" label="Tags" value={draft.tags.map((t) => `#${t}`).join(' ')} /> : null}
            </View>
          ) : (
            <View style={styles.examples}>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>Try one of these:</Text>
              {EXAMPLES.map((e) => (
                <TouchableOpacity
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={`Use example ${e}`}
                  style={[styles.example, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setText(e)}
                >
                  <Text style={{ color: colors.text, fontSize: FontSizes.sm }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Button label="Save" onPress={() => void save()} loading={saving} disabled={!ready} />
          <Button label="Use the full form instead" variant="ghost" onPress={() => router.replace(routes.manualEntry)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  input: { fontSize: FontSizes.lg, minHeight: 56, borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md },
  preview: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  amount: { fontSize: FontSizes.xxxl, fontWeight: '800', marginBottom: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 28 },
  rowLabel: { width: 80, fontSize: FontSizes.sm },
  rowValue: { flex: 1, fontSize: FontSizes.md, fontWeight: '600' },
  examples: { gap: Spacing.sm },
  hint: { fontSize: FontSizes.sm },
  captureRow: { flexDirection: 'row', gap: Spacing.sm },
  capture: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, minHeight: 48, borderRadius: BorderRadius.lg, borderWidth: 1 },
  captureText: { fontSize: FontSizes.sm, fontWeight: '700' },
  example: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
