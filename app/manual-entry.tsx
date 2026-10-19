import * as Contacts from 'expo-contacts';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { DEFAULT_EXPENSE_CATEGORY_KEY, INCOME_CATEGORY_KEY } from '@/domain/categories';
import { parseRupees } from '@/domain/money';
import { PAYMENT_METHODS, PaymentMethod, TransactionType } from '@/domain/types';
import { isValidVpa, normalizeVpa, sanitizeText } from '@/domain/upi/vpa';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { setPaymentDraft } from '@/lib/payment-draft-store';

/** Pick one contact with the system picker. Nothing but the chosen name is read, and nothing is stored. */
async function pickContactName(): Promise<string | null> {
  try {
    return (await Contacts.presentContactPickerAsync())?.name ?? null;
  } catch {
    const permission = await Contacts.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to contacts to pick a name. SpentSmart only reads the contact you choose.');
      return null;
    }
    return (await Contacts.presentContactPickerAsync())?.name ?? null;
  }
}

export default function ManualEntryScreen() {
  const colors = useThemeColors();
  const repos = useRepos();
  const [amountText, setAmountText] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [categoryKey, setCategoryKey] = useState(DEFAULT_EXPENSE_CATEGORY_KEY);
  const [saving, setSaving] = useState(false);

  const amount = parseRupees(amountText);
  const vpaTrimmed = upiId.trim();
  const vpaError = vpaTrimmed !== '' && !isValidVpa(vpaTrimmed);
  const name = sanitizeText(payeeName, 60);

  const validate = (): boolean => {
    if (amount === null) {
      Alert.alert('Amount needed', 'Enter an amount greater than zero, like 250 or 250.50.');
      return false;
    }
    if (!name) {
      Alert.alert('Name needed', 'Please enter a name.');
      return false;
    }
    if (vpaError) {
      Alert.alert('Check the UPI ID', 'It should look like name@bank.');
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!validate() || amount === null) return;
    setSaving(true);
    try {
      await repos.transactions.insert({
        amountPaise: amount,
        type,
        categoryKey: type === 'income' ? INCOME_CATEGORY_KEY : categoryKey,
        payeeName: name,
        payeeVpa: vpaTrimmed ? normalizeVpa(vpaTrimmed) : null,
        paymentMethod: method,
        note: sanitizeText(note, 80) || null,
        verifiedBy: 'manual',
      });
      router.replace(routes.home);
    } catch (error) {
      log.error('Manual entry failed', error);
      Alert.alert('Error', 'The transaction could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const payNow = () => {
    if (!validate() || amount === null) return;
    if (!vpaTrimmed) {
      Alert.alert('UPI ID needed', 'Enter the payee’s UPI ID to pay now, or choose “Just save”.');
      return;
    }
    setPaymentDraft({ vpa: normalizeVpa(vpaTrimmed), payeeName: name, amountPaise: amount, note: sanitizeText(note, 80) || undefined, categoryKey, amountEditable: true });
    router.push(routes.payment);
  };

  const onSavePressed = () => {
    if (type === 'expense' && method === 'upi' && vpaTrimmed) {
      Alert.alert('Add this expense', 'Pay now through your UPI app, or just record a payment you already made.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Just save', onPress: () => void save() },
        { text: 'Pay now', onPress: payNow },
      ]);
    } else {
      void save();
    }
  };

  const Chip = ({ active, label, onPress, tone }: { active: boolean; label: string; onPress: () => void; tone?: string }) => (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.chip, { backgroundColor: active ? tone ?? colors.tint : colors.surface, borderColor: active ? tone ?? colors.tint : colors.border }]}
      onPress={onPress}
    >
      <Text style={{ color: active ? colors.onTint : colors.textSecondary, fontSize: FontSizes.xs, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Add transaction" leading="close" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.typeRow}>
            <Chip active={type === 'expense'} label="Expense" tone={colors.error} onPress={() => setType('expense')} />
            <Chip active={type === 'income'} label="Income" tone={colors.success} onPress={() => setType('income')} />
          </View>

          <View style={styles.amountRow}>
            <Text style={[styles.currency, { color: colors.text }]}>₹</Text>
            <TextInput
              accessibilityLabel="Amount in rupees"
              style={[styles.amountInput, { color: colors.text }]}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>
          {amountText !== '' && amount === null ? <Text style={[styles.error, { color: colors.error }]}>Enter an amount like 250 or 250.50</Text> : null}

          <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{type === 'income' ? 'Payer name' : 'Payee name'}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Pick a name from your contacts"
                style={[styles.contactButton, { backgroundColor: colors.surface }]}
                onPress={async () => {
                  const picked = await pickContactName();
                  if (picked) setPayeeName(picked);
                }}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.tint} />
                <Text style={{ color: colors.tint, fontSize: FontSizes.xs, fontWeight: '600' }}>Pick contact</Text>
              </TouchableOpacity>
            </View>
            <TextInput accessibilityLabel="Name" style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={payeeName} onChangeText={setPayeeName} placeholder="Name" placeholderTextColor={colors.textSecondary} maxLength={60} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>UPI ID (optional)</Text>
            <TextInput
              accessibilityLabel="UPI ID"
              style={[styles.input, { color: colors.text, borderColor: vpaError ? colors.error : colors.border }]}
              value={upiId}
              onChangeText={setUpiId}
              placeholder="user@bank"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            {vpaError ? <Text style={[styles.error, { color: colors.error, textAlign: 'left' }]}>That doesn’t look like a UPI ID (name@bank).</Text> : null}

            <Text style={[styles.label, { color: colors.textSecondary }]}>Note</Text>
            <TextInput accessibilityLabel="Note" style={[styles.input, { color: colors.text, borderColor: colors.border }]} value={note} onChangeText={setNote} placeholder="What was this for?" placeholderTextColor={colors.textSecondary} maxLength={80} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Payment method</Text>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.map((m) => (
                <Chip key={m} active={method === m} label={m.toUpperCase()} onPress={() => setMethod(m)} />
              ))}
            </View>

            {type === 'expense' ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
                <CategoryPicker selectedCategory={categoryKey} onSelectCategory={setCategoryKey} mode="chips" exclude={[INCOME_CATEGORY_KEY]} />
              </>
            ) : null}
          </View>

          <Button label="Save transaction" onPress={onSavePressed} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  typeRow: { flexDirection: 'row', gap: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flex: 1, minHeight: MIN_TOUCH_TARGET - 8, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  currency: { fontSize: 40, fontWeight: '700', marginRight: 8 },
  amountInput: { fontSize: 56, fontWeight: '700', minWidth: 120 },
  error: { fontSize: FontSizes.xs, textAlign: 'center' },
  form: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: FontSizes.sm, marginTop: Spacing.sm },
  input: { fontSize: FontSizes.md, minHeight: 44, borderBottomWidth: 1 },
  contactButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 36, borderRadius: BorderRadius.sm },
});
