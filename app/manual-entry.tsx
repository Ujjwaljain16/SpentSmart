import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CategoryType, TransactionType, PaymentMethod } from '@/types/transaction';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { saveTransaction } from '@/services/storage';

export default function ManualEntryScreen() {
  const [amount, setAmount] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [category, setCategory] = useState<CategoryType>('food');

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const insets = useSafeAreaInsets();

  const pickContact = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });

      if (data.length > 0) {
        // For simplicity, just pick the first one from a picker if many, 
        // but here we might need a more complex UI. 
        // Let's use Contacts.presentContactPickerAsync instead for better UX.
        try {
          const contact = await Contacts.presentContactPickerAsync();
          if (contact) {
            setPayeeName(contact.name);
            // We don't have a reliable way to get UPI ID from phone number without NPCI API,
            // so we leave UPI ID empty for the user to fill or it defaults to 'manual'.
          }
        } catch (e) {
          console.error('Contact picker error:', e);
        }
      }
    } else {
      Alert.alert('Permission Denied', 'Please enable contact permissions to use this feature.');
    }
  };


  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || isNaN(parsedAmount)) {
      Alert.alert('Required', 'Please enter a valid amount');
      return;
    }

    if (!payeeName.trim()) {
      Alert.alert('Required', 'Please enter a name');
      return;
    }

    if (type === 'expense' && paymentMethod === 'upi') {
      Alert.alert(
        'Transaction Saved',
        'Would you like to complete the payment now?',
        [
          {
            text: 'Just Save',
            onPress: async () => {
              // Save as completed immediately (Manual Entry logic)
              await saveTransaction(
                {
                  upiId: upiId || 'manual',
                  payeeName: payeeName,
                  amount: parsedAmount,
                  transactionNote: note,
                },
                category,
                note || `Paid to ${payeeName}`,
                parsedAmount,
                Date.now(),
                type,
                paymentMethod
              );
              router.replace('/(tabs)');
            },
            style: 'cancel'
          },
          {
            text: 'Pay Now',
            onPress: () => {
              // Redirect to Payment Screen for full verification flow
              // We do NOT save it here yet, PaymentScreen will handle "Pending" -> "Completed"
              router.push({
                pathname: '/payment',
                params: {
                  upiId: upiId || '',
                  payeeName: payeeName,
                  amount: parsedAmount.toString(),
                  transactionNote: note,
                  initialCategory: category,
                }
              });
            }
          }
        ]
      );
    } else {
      // Non-UPI or Income: Save directly
      await saveTransaction(
        {
          upiId: upiId || 'manual',
          payeeName: payeeName,
          amount: parsedAmount,
          transactionNote: note,
        },
        category,
        note || `${type === 'income' ? 'Received from' : 'Paid to'} ${payeeName}`,
        parsedAmount,
        Date.now(),
        type,
        paymentMethod
      );
      router.replace('/(tabs)');
    }
    // Error handling moved to individual catch blocks if needed, 
    // but here we are wrapping the "Just Save" async call.
  };

  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.headerButton, { backgroundColor: colors.card }]}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Manual Entry
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Type Toggle */}
          <View style={styles.typeToggleContainer}>
            <TouchableOpacity
              style={[
                styles.typeOption,
                type === 'expense' && styles.typeOptionActive,
                { backgroundColor: type === 'expense' ? colors.error : colors.card }
              ]}
              onPress={() => {
                setType('expense');
                if (category === 'income') setCategory('food');
              }}
            >
              <Text style={[styles.typeText, { color: type === 'expense' ? '#FFF' : colors.textSecondary }]}>Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeOption,
                type === 'income' && styles.typeOptionActive,
                { backgroundColor: type === 'income' ? colors.success : colors.card }
              ]}
              onPress={() => {
                setType('income');
                setCategory('income');
              }}
            >
              <Text style={[styles.typeText, { color: type === 'income' ? '#FFF' : colors.textSecondary }]}>Income</Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={styles.amountContainer}>
            <Text style={[styles.currencySymbol, { color: colors.text }]}>₹</Text>
            <TextInput
              style={[styles.amountInput, { color: colors.text }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          {/* Form Fields */}
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{type === 'income' ? 'Payer Name' : 'Payee Name'}</Text>
              {type === 'expense' && (
                <TouchableOpacity onPress={pickContact} style={[styles.contactButton, { backgroundColor: colors.surface }]}>
                  <Ionicons name="person-add-outline" size={16} color={colors.tint} />
                  <Text style={[styles.contactButtonText, { color: colors.tint }]}>Pick Contact</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={payeeName}
              onChangeText={setPayeeName}
              placeholder="Name"
              placeholderTextColor={colors.textSecondary}
            />

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>UPI ID (Optional)</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="user@bank"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Note</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                value={note}
                onChangeText={setNote}
                placeholder="What was this for?"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Payment Method</Text>
              <View style={styles.methodRow}>
                {(['upi', 'cash', 'bank', 'other'] as PaymentMethod[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.methodChip,
                      paymentMethod === m && styles.methodChipActive,
                      {
                        backgroundColor: paymentMethod === m ? colors.tint : colors.surface,
                        borderColor: paymentMethod === m ? colors.tint : colors.border
                      }
                    ]}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Text style={[
                      styles.methodText,
                      { color: paymentMethod === m ? '#FFF' : colors.textSecondary }
                    ]}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
              <CategoryPicker
                selectedCategory={category}
                onSelectCategory={setCategory}
                mode="chips"
              />
            </View>
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.tint }]} onPress={handleSave}>
            <Text style={[styles.saveButtonText, { color: '#FFF' }]}>Save Transaction</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: Spacing.xl,
    gap: 8,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  typeOptionActive: {
    // Background set dynamically
  },
  typeText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    fontSize: FontSizes.md,
  },
  typeTextActive: {
    color: '#FFF',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  currencySymbol: {
    fontSize: 40,
    color: '#FFF',
    fontWeight: '700',
    marginRight: 8,
  },
  amountInput: {
    fontSize: 56,
    color: '#FFF',
    fontWeight: '700',
    minWidth: 120,
  },
  formCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  input: {
    color: '#FFF',
    fontSize: FontSizes.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  methodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  methodChipActive: {
    borderColor: '#FFF',
  },
  methodText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  methodTextActive: {
    color: '#1E3A8A',
  },
  saveButton: {
    backgroundColor: '#FFF',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  saveButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.xs,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  contactButtonText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
