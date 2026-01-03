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
          console.log('Contact picker error:', e);
        }
      }
    } else {
      Alert.alert('Permission Denied', 'Please enable contact permissions to use this feature.');
    }
  };

  const launchUPI = (amount: string, name: string) => {
    const upiUrl = `upi://pay?pa=&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
    Linking.openURL(upiUrl).catch(() => {
      Alert.alert('Error', 'Could not launch UPI app. Please ensure you have a UPI app installed.');
    });
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

    try {
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

      if (type === 'expense' && paymentMethod === 'upi') {
        Alert.alert(
          'Transaction Saved',
          'Would you like to complete the payment now?',
          [
            {
              text: 'Later',
              onPress: () => router.replace('/(tabs)'),
              style: 'cancel'
            },
            {
              text: 'Pay Now',
              onPress: () => {
                launchUPI(amount, payeeName);
                router.replace('/(tabs)');
              }
            }
          ]
        );
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save transaction');
    }
  };

  const backgroundColor = colorScheme === 'dark' ? '#1E3A8A' : '#3B82F6';

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#FFF' }]}>
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
                { backgroundColor: type === 'expense' ? '#EF4444' : 'rgba(255,255,255,0.1)' }
              ]}
              onPress={() => {
                setType('expense');
                if (category === 'income') setCategory('food');
              }}
            >
              <Text style={[styles.typeText, type === 'expense' && styles.typeTextActive]}>Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeOption,
                type === 'income' && styles.typeOptionActive,
                { backgroundColor: type === 'income' ? '#10B981' : 'rgba(255,255,255,0.1)' }
              ]}
              onPress={() => {
                setType('income');
                setCategory('income');
              }}
            >
              <Text style={[styles.typeText, type === 'income' && styles.typeTextActive]}>Income</Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={styles.amountContainer}>
            <Text style={styles.currencySymbol}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor="rgba(255,255,255,0.4)"
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          {/* Form Fields */}
          <View style={styles.formCard}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{type === 'income' ? 'Payer Name' : 'Payee Name'}</Text>
              {type === 'expense' && (
                <TouchableOpacity onPress={pickContact} style={styles.contactButton}>
                  <Ionicons name="person-add-outline" size={16} color="#FFF" />
                  <Text style={styles.contactButtonText}>Pick Contact</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              value={payeeName}
              onChangeText={setPayeeName}
              placeholder="Name"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />

            <View style={styles.inputGroup}>
              <Text style={styles.label}>UPI ID (Optional)</Text>
              <TextInput
                style={styles.input}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="user@bank"
                placeholderTextColor="rgba(255,255,255,0.4)"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Note</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="What was this for?"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.methodRow}>
                {(['upi', 'cash', 'bank', 'other'] as PaymentMethod[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.methodChip,
                      paymentMethod === m && styles.methodChipActive,
                      { backgroundColor: paymentMethod === m ? '#FFF' : 'rgba(255,255,255,0.1)' }
                    ]}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Text style={[styles.methodText, paymentMethod === m && styles.methodTextActive]}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Category</Text>
              <CategoryPicker
                selectedCategory={category}
                onSelectCategory={setCategory}
                mode="chips"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save Transaction</Text>
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: Spacing.xl,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    borderBottomColor: 'rgba(255,255,255,0.2)',
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
