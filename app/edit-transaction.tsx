import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { DEFAULT_EXPENSE_CATEGORY_KEY, INCOME_CATEGORY_KEY } from '@/domain/categories';
import { paiseToDecimal, parseRupees } from '@/domain/money';
import { PAYMENT_METHODS, PaymentMethod, Transaction, TransactionType } from '@/domain/types';
import { sanitizeText } from '@/domain/upi/vpa';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const repos = useRepos();

  const [original, setOriginal] = useState<Transaction | null | undefined>(undefined);
  const [amountText, setAmountText] = useState('');
  const [categoryKey, setCategoryKey] = useState(DEFAULT_EXPENSE_CATEGORY_KEY);
  const [note, setNote] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    repos.transactions
      .getById(String(id))
      .then((t) => {
        if (!alive) return;
        setOriginal(t);
        if (t) {
          setAmountText(paiseToDecimal(t.amountPaise));
          setCategoryKey(t.categoryKey);
          setNote(t.note ?? '');
          setType(t.type);
          setMethod(t.paymentMethod);
        }
      })
      .catch((error) => {
        log.error('Could not load transaction', error);
        if (alive) setOriginal(null);
      });
    return () => {
      alive = false;
    };
  }, [id, repos]);

  const amount = parseRupees(amountText);

  const save = async () => {
    if (!original || amount === null) return;
    setSaving(true);
    try {
      const updated = await repos.transactions.update(original.id, {
        amountPaise: amount,
        type,
        categoryKey: type === 'income' ? INCOME_CATEGORY_KEY : categoryKey === INCOME_CATEGORY_KEY ? DEFAULT_EXPENSE_CATEGORY_KEY : categoryKey,
        paymentMethod: method,
        note: sanitizeText(note, 80) || null,
      });
      if (!updated) {
        Alert.alert('Not found', 'This transaction no longer exists.');
        return;
      }
      router.back();
    } catch (error) {
      log.error('Update failed', error);
      Alert.alert('Error', 'The transaction could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (original === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (original === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Edit transaction" leading="close" />
        <View style={styles.center}>
          <Text style={{ color: colors.text, fontSize: FontSizes.lg }}>This transaction no longer exists.</Text>
          <Button label="Go back" onPress={() => router.back()} style={styles.back} />
        </View>
      </View>
    );
  }

  const Toggle = ({ active, label, tone, onPress }: { active: boolean; label: string; tone: string; onPress: () => void }) => (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.toggle, { backgroundColor: active ? tone : 'transparent' }]}
      onPress={onPress}
    >
      <Text style={{ color: active ? colors.onTint : colors.textSecondary, fontWeight: '600', fontSize: FontSizes.sm }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Edit transaction" leading="close" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.toggleRow, { backgroundColor: colors.card }]}>
          <Toggle active={type === 'expense'} label="Expense" tone={colors.error} onPress={() => setType('expense')} />
          <Toggle active={type === 'income'} label="Income" tone={colors.success} onPress={() => setType('income')} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{type === 'income' ? 'Payer' : 'Payee'}</Text>
          <Text style={[styles.payee, { color: colors.text }]}>{original.payeeName}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{original.payeeVpa ?? 'Manual record'}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{format(new Date(original.occurredAt), 'd MMM yyyy, h:mm a')}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Amount (₹) *</Text>
          <TextInput
            accessibilityLabel="Amount in rupees"
            style={[styles.amountInput, { color: colors.text, borderColor: amount === null ? colors.error : colors.border }]}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          {amount === null ? <Text style={{ color: colors.error, fontSize: FontSizes.xs }}>Enter an amount like 250 or 250.50</Text> : null}
        </View>

        {type === 'expense' ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
            <CategoryPicker selectedCategory={categoryKey} onSelectCategory={setCategoryKey} mode="chips" exclude={[INCOME_CATEGORY_KEY]} />
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Payment method</Text>
          <View style={styles.methods}>
            {PAYMENT_METHODS.map((m) => {
              const active = method === m;
              return (
                <TouchableOpacity
                  key={m}
                  accessibilityRole="radio"
                  accessibilityLabel={m}
                  accessibilityState={{ selected: active }}
                  style={[styles.method, { backgroundColor: active ? colors.tint : colors.surface, borderColor: active ? colors.tint : colors.border }]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={{ color: active ? colors.onTint : colors.textSecondary, fontSize: FontSizes.xs, fontWeight: '700' }}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Note (optional)</Text>
          <TextInput
            accessibilityLabel="Note"
            style={[styles.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={80}
          />
        </View>

        <Button label="Save changes" onPress={() => void save()} disabled={amount === null} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  back: { minWidth: 160 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  toggleRow: { flexDirection: 'row', borderRadius: BorderRadius.lg, padding: 4, gap: 8 },
  toggle: { flex: 1, minHeight: MIN_TOUCH_TARGET - 8, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.xs },
  label: { fontSize: FontSizes.sm, fontWeight: '500' },
  payee: { fontSize: FontSizes.lg, fontWeight: '600' },
  sub: { fontSize: FontSizes.sm },
  amountInput: { fontSize: 32, fontWeight: '700', borderBottomWidth: 1, paddingVertical: Spacing.xs },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  method: { minHeight: 40, paddingHorizontal: 14, borderRadius: BorderRadius.full, borderWidth: 1, justifyContent: 'center' },
  noteInput: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, minHeight: 80, fontSize: FontSizes.md, textAlignVertical: 'top' },
});
