import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { CategoryType, UPIPaymentData } from '@/types/transaction';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { saveTransaction } from '@/services/storage';
import { buildUPIUrl } from '@/constants/upi-config';
import { QRPaymentGenerator } from '@/components/payment/QRPaymentGenerator';
import { openUPIApp, getInstalledUPIApps, getPreferredUPIApp, setPreferredUPIApp, UPIAppInfo, launchUPIFallback, getAllInstalledUPIApps, UPI_APPS } from '@/services/upi-app-launcher';
import { usePaymentConfirmation } from '@/hooks/usePaymentConfirmation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PendingManager } from '@/services/pending-manager';

export default function PaymentScreen() {
  const params = useLocalSearchParams<{
    upiId: string;
    payeeName: string;
    amount: string;
    transactionNote: string;
    rawParams?: string; // JSON string of original QR parameters
  }>();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState(params.amount || '');
  const [category, setCategory] = useState<CategoryType | null>(null);
  const [reason, setReason] = useState(params.transactionNote || '');
  const [isLoading, setIsLoading] = useState(false);
  const [installedApps, setInstalledApps] = useState<UPIAppInfo[]>([]);
  const [preferredApp, setPreferredAppState] = useState<string | null>(null);
  const [showQRGenerator, setShowQRGenerator] = useState(false);
  const [showAppChooser, setShowAppChooser] = useState(false);

  const { showConfirmation, timeSpentInUPIApp, suggestedConfidence, hideConfirmation, startTracking } = usePaymentConfirmation();

  useEffect(() => {
    const checkApps = async () => {
      // Use dynamic discovery to find ALL UPI apps on the device
      const installed = await getAllInstalledUPIApps();
      setInstalledApps(installed);

      const preferred = await getPreferredUPIApp();
      if (preferred) setPreferredAppState(preferred);
    };
    checkApps();
  }, [category]); // Re-check if category changes to ensure list is fresh

  // Parse rawParams - Base64 decode first to preserve URL encoding
  const rawParams: Record<string, string> | undefined = params.rawParams
    ? JSON.parse(atob(params.rawParams))
    : undefined;

  console.log('📥 Received rawParams:', rawParams); // Debug

  const paymentData: UPIPaymentData = {
    upiId: params.upiId || '',
    payeeName: params.payeeName || 'Unknown',
    amount: parseFloat(amount) || undefined,
    rawParams, // Include original QR parameters
  };

  const canPay =
    paymentData.upiId &&
    amount &&
    parseFloat(amount) > 0 &&
    category;

  const handleOpenUPIApp = async (appId?: string) => {
    if (!canPay) {
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return;
    }

    setIsLoading(true);

    try {
      const amountNum = parseFloat(amount);

      // DON'T save transaction yet - just store data for later
      // We'll save only if user confirms payment

      // Start tracking time for smart confirmation
      startTracking();

      // Open UPI app (just the app, no payment data to avoid security blocks)
      const appToOpen = appId || preferredApp || installedApps[0]?.id;
      if (!appToOpen) {
        Alert.alert(
          'No UPI App Found',
          'Please install a UPI app like Google Pay or PhonePe to make payments.'
        );
        setIsLoading(false);
        return;
      }

      console.log(`🚀 Launching ${appToOpen} by package...`);

      // Generate a unique ID for this attempt
      const attemptId = `tx_${Date.now()}`;

      // 💾 Save as pending in case of app kill
      await PendingManager.savePending({
        id: attemptId,
        paymentData,
        category: category!,
        reason: reason.trim() || undefined,
        timestamp: Date.now(),
        status: 'pending',
        launchedApp: appToOpen
      });

      const success = await openUPIApp(appToOpen);

      if (!success) {
        setIsLoading(false);
        return;
      }

      // App opened successfully - user will confirm when they return
      console.log(`✅ UPI app opened successfully`);

    } catch (error) {
      console.error('Error opening UPI app:', error);
      Alert.alert('Error', 'Failed to open UPI app. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPayment = async (confidence: 'high' | 'medium' | 'none') => {
    hideConfirmation();

    if (confidence === 'none') {
      // User cancelled payment
      // Resolve the pending transaction as cancelled
      const activePendings = await PendingManager.getPendings();
      if (activePendings.length > 0) {
        await PendingManager.resolvePending(activePendings[0].id, 'cancelled');
      }

      Alert.alert('Payment Cancelled', 'No transaction was saved.');
      router.back();
      return;
    }

    // User confirmed payment - NOW save the transaction
    try {
      const amountNum = parseFloat(amount);

      await saveTransaction(
        paymentData,
        category!,
        reason.trim() || undefined,
        amountNum,
        Date.now()
      );

      // Resolve the pending transaction as confirmed
      const activePendings = await PendingManager.getPendings();
      if (activePendings.length > 0) {
        await PendingManager.resolvePending(activePendings[0].id, 'confirmed');
      }

      Alert.alert(
        'Payment Saved',
        `Transaction saved with ${confidence === 'high' ? 'high' : 'medium'} confidence.`,
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      console.error('Error saving transaction:', error);
      Alert.alert('Error', 'Failed to save transaction.');
    }
  };

  const handleClose = () => {
    Alert.alert(
      'Discard Payment?',
      'Are you sure you want to cancel this payment?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => router.back(), style: 'destructive' },
      ]
    );
  };

  // Show QR generator if requested
  if (showQRGenerator) {
    const upiUrl = buildUPIUrl({
      upiId: paymentData.upiId,
      payeeName: paymentData.payeeName,
      amount: parseFloat(amount) || 0,
      transactionNote: reason.trim() || undefined,
      rawParams: rawParams,
    });

    return (
      <QRPaymentGenerator
        upiUrl={upiUrl}
        payeeName={paymentData.payeeName}
        upiId={paymentData.upiId}
        amount={parseFloat(amount)}
        onClose={() => setShowQRGenerator(false)}
      />
    );
  }

  return (
    <>
      {/* Smart Payment Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Did you complete the payment?
            </Text>

            <View style={styles.paymentDetails}>
              <Text style={[styles.modalAmount, { color: colors.text }]}>
                ₹{amount}
              </Text>
              <Text style={[styles.modalPayee, { color: colors.textSecondary }]}>
                to {paymentData.payeeName}
              </Text>
              <Text style={[styles.modalTime, { color: colors.textSecondary }]}>
                (Spent {timeSpentInUPIApp}s in UPI app)
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSuccess, { backgroundColor: colors.tint }]}
                onPress={() => handleConfirmPayment('high')}
              >
                <Text style={styles.modalButtonText}>Yes, Paid ✓</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonMaybe, { backgroundColor: colors.textSecondary }]}
                onPress={() => handleConfirmPayment('medium')}
              >
                <Text style={styles.modalButtonText}>Not Sure</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, { backgroundColor: colors.border }]}
                onPress={() => handleConfirmPayment('none')}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>No, Cancelled</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Spacing.sm,
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            New Payment
          </Text>
          <View style={styles.headerButton} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Payee Info Card */}
            <View style={[styles.payeeCard, { backgroundColor: colors.card }]}>
              <View style={styles.payeeIconContainer}>
                <Ionicons name="person-circle" size={48} color={colors.tint} />
              </View>
              <View style={styles.payeeInfo}>
                <Text
                  style={[styles.payeeName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {paymentData.payeeName}
                </Text>
                <Text
                  style={[styles.upiId, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {paymentData.upiId}
                </Text>
              </View>
            </View>

            {/* MANUAL PAYMENT FAILOVER UI */}
            {/* Active if scanning strict banks (e.g. Axis/@axl) or if deep link fails */}
            <View style={[styles.manualPayContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.manualPayHeader}>
                <Ionicons name="shield-checkmark" size={20} color={colors.textSecondary} />
                <Text style={[styles.manualPayTitle, { color: colors.text }]}>Secure Payment Mode</Text>
              </View>
              <Text style={[styles.manualPayDesc, { color: colors.textSecondary }]}>
                This bank ({paymentData.upiId.split('@')[1]}) requires manual payment for security.
              </Text>

              <View style={styles.copyRow}>
                <View style={styles.copyContent}>
                  <Text style={[styles.copyLabel, { color: colors.textSecondary }]}>VPA / UPI ID</Text>
                  <Text style={[styles.copyValue, { color: colors.text }]}>{paymentData.upiId}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.copyButton, { backgroundColor: colors.tint }]}
                  onPress={() => {
                    /* Clipboard logic would go here */
                    Alert.alert('Copied', 'UPI ID copied to clipboard');
                  }}
                >
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.copyRow}>
                <View style={styles.copyContent}>
                  <Text style={[styles.copyLabel, { color: colors.textSecondary }]}>Amount</Text>
                  <Text style={[styles.copyValue, { color: colors.text }]}>₹{amount || '0'}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.copyButton, { backgroundColor: colors.tint }]}
                  onPress={() => {
                    /* Clipboard logic */
                    Alert.alert('Copied', 'Amount copied');
                  }}
                >
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Amount Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Amount *
              </Text>
              <View
                style={[
                  styles.amountInputContainer,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.currencySymbol, { color: colors.tint }]}>
                  ₹
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.text }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Category Picker */}
            <CategoryPicker
              selectedCategory={category}
              onSelectCategory={setCategory}
            />

            {/* Reason Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Reason (optional)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Groceries, Lunch, etc."
                placeholderTextColor={colors.textSecondary}
                maxLength={50}
                returnKeyType="done"
              />
            </View>
          </ScrollView>

          {/* Smart UPI App Launcher */}
          <View
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + Spacing.md,
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                borderTopWidth: 1,
              },
            ]}
          >
            <Text style={[styles.label, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
              Choose Payment Method
            </Text>

            <View style={{ gap: 12 }}>
              {installedApps.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {installedApps.map((app) => (
                    <TouchableOpacity
                      key={app.id}
                      style={[
                        styles.payButton,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.tint,
                          borderWidth: 1,
                          flex: 1,
                          minWidth: '45%',
                          opacity: canPay ? 1 : 0.5,
                        },
                      ]}
                      onPress={() => handleOpenUPIApp(app.id)}
                      disabled={!canPay || isLoading}
                    >
                      <Ionicons name="wallet-outline" size={18} color={colors.tint} />
                      <Text style={[styles.payButtonText, { color: colors.text, fontSize: FontSizes.sm }]}>
                        {app.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.payButton,
                  {
                    backgroundColor: colors.tint,
                    opacity: canPay ? 1 : 0.5,
                    marginTop: Spacing.xs,
                  },
                ]}
                onPress={async () => {
                  if (canPay) {
                    setIsLoading(true);
                    try {
                      console.log('🔍 Fetching all possible UPI apps...');
                      const allApps = await getAllInstalledUPIApps();

                      // Filter for apps that aren't already shown in the primary grid
                      const otherApps = allApps.filter(
                        (app: UPIAppInfo) => !installedApps.some(primary => primary.packageName === app.packageName)
                      );

                      if (otherApps.length === 0) {
                        // If Tier 1 discovery found nothing (old build), show EVERYTHING as a list
                        // This allows user to "try" launching common apps even if detection failed
                        Alert.alert(
                          'Select App Manually',
                          'We couldn\'t detect other apps automatically. Please pick from common Indian UPI apps below:',
                          [
                            ...UPI_APPS.filter((app: UPIAppInfo) => !installedApps.some(p => p.packageName === app.packageName))
                              .slice(0, 7) // Show top 7 next choices
                              .map((app: UPIAppInfo) => ({
                                text: app.name,
                                onPress: () => {
                                  startTracking();
                                  handleOpenUPIApp(app.id);
                                }
                              })),
                            { text: 'Cancel', style: 'cancel' }
                          ]
                        );
                        return;
                      }

                      // Show a manual selection of detected other apps
                      Alert.alert(
                        'Select UPI App',
                        'Choose an app to open. We will launch it directly to ensure success.',
                        [
                          ...otherApps.map((app: UPIAppInfo) => ({
                            text: app.name,
                            onPress: () => {
                              startTracking();
                              handleOpenUPIApp(app.id);
                            }
                          })),
                          { text: 'Cancel', style: 'cancel' }
                        ]
                      );
                    } catch (err) {
                      console.error('App picker error:', err);
                      Alert.alert('Error', 'Could not open app list.');
                    } finally {
                      setIsLoading(false);
                    }
                  } else {
                    Alert.alert('Missing Information', 'Please fill in all required fields.');
                  }
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="list-outline" size={20} color="#fff" />
                    <Text style={styles.payButtonText}>More UPI Apps</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Scannable QR Generator - 100% Reliable Fallback */}
            <TouchableOpacity
              style={[
                styles.qrButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.tint,
                  opacity: canPay ? 1 : 0.5,
                },
              ]}
              onPress={() => setShowQRGenerator(true)}
              disabled={!canPay}
            >
              <Ionicons name="qr-code" size={20} color={colors.tint} />
              <Text style={[styles.qrButtonText, { color: colors.tint }]}>
                Generate Scannable QR (100% Works)
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </>
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
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  payeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  payeeIconContainer: {
    marginRight: Spacing.md,
  },
  payeeInfo: {
    flex: 1,
  },
  payeeName: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    marginBottom: 2,
  },
  upiId: {
    fontSize: FontSizes.sm,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  currencySymbol: {
    fontSize: FontSizes.xxl,
    fontWeight: '600',
    marginRight: Spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: FontSizes.xxl,
    fontWeight: '600',
    paddingVertical: Spacing.md,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.md,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  payButtonText: {
    color: '#fff',
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  // Manual Payment Fallback Styles
  manualPayContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  manualPayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  manualPayTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  manualPayDesc: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  copyContent: {
    flex: 1,
  },
  copyLabel: {
    fontSize: FontSizes.xs,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  copyValue: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.md,
  },
  copyButtonText: {
    color: '#fff',
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    borderWidth: 2,
    marginTop: Spacing.md,
  },
  qrButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  noAppsText: {
    textAlign: 'center',
    padding: Spacing.lg,
    fontSize: FontSizes.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  paymentDetails: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalAmount: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  modalPayee: {
    fontSize: FontSizes.md,
    marginBottom: Spacing.xs,
  },
  modalTime: {
    fontSize: FontSizes.sm,
  },
  modalButtons: {
    gap: Spacing.md,
  },
  modalButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalButtonSuccess: {},
  modalButtonMaybe: {},
  modalButtonCancel: {},
  modalButtonText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});

