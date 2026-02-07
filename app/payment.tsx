import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { CategoryType } from '@/types/transaction';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { PhonePeIcon, GPayIcon, QRIcon } from '@/components/payment/BrandIcons';
import { saveTransaction } from '@/services/storage';
import { buildUPIUrl } from '@/constants/upi-config';
import { QRPaymentGenerator } from '@/components/payment/QRPaymentGenerator';
import { openUPIApp, getInstalledUPIApps, getPreferredUPIApp, setPreferredUPIApp, UPIAppInfo, UPI_APPS } from '@/services/upi-app-launcher';
import { usePaymentConfirmation } from '@/hooks/usePaymentConfirmation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PendingManager } from '@/services/pending-manager';
import { SlideToPay } from '@/components/ui/SlideToPay';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { shareQRToGPay } from '@/services/silent-qr-share';

export default function PaymentScreen() {
  /* Updated Params to accept Category */
  const params = useLocalSearchParams<{
    upiId: string;
    payeeName: string;
    amount: string;
    transactionNote: string;
    rawParams?: string;
    initialCategory?: CategoryType; /* Added Param */
  }>();

  // Helper to safely parse params
  const paymentData = {
    upiId: params.upiId || 'unknown@upi',
    payeeName: params.payeeName || 'Unknown Payee',
    amount: params.amount,
    transactionNote: params.transactionNote || '',
  };

  const rawParams: Record<string, string> | undefined = params.rawParams
    ? JSON.parse(atob(params.rawParams))
    : undefined;

  const [amount, setAmount] = useState(paymentData.amount || '');
  const [transactionNote, setTransactionNote] = useState(paymentData.transactionNote || '');
  /* Initialize with param or default */
  const [category, setCategory] = useState<CategoryType>(params.initialCategory as CategoryType || 'food');
  const [isLoading, setIsLoading] = useState(false);
  const [installedApps, setInstalledApps] = useState<UPIAppInfo[]>([]);
  const [preferredApp, setPreferredApp] = useState<string | null>(null);
  const [showQRGenerator, setShowQRGenerator] = useState(false);

  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const { showConfirmation, confidenceScore, hideConfirmation } = usePaymentConfirmation();

  /* Restore state from pending if available (handles app restart) */
  useEffect(() => {
    const restoreState = async () => {
      try {
        const activePendings = await PendingManager.getPendings();
        if (activePendings.length > 0) {
          // Get most recent
          const recent = activePendings[0];
          // Only restore if less than 5 minutes old
          if (Date.now() - recent.timestamp < 5 * 60 * 1000) {
            // console.log('🔄 Restoring state from pending transaction');
            if (recent.paymentData.amount) setAmount(recent.paymentData.amount.toString());
            if (recent.reason) setTransactionNote(recent.reason);
            if (recent.category) setCategory(recent.category);
          }
        }
      } catch (e) {
        console.warn('Failed to restore pending state', e);
      }
    };
    restoreState();
  }, []);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    setIsLoading(true);
    try {
      const apps = await getInstalledUPIApps();
      setInstalledApps(apps);
      const savedPref = await getPreferredUPIApp();
      if (savedPref) setPreferredApp(savedPref);
    } catch (error) {
      console.error('Failed to load UPI apps:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const currentAmount = parseFloat(amount);
  const canPay = !isNaN(currentAmount) && currentAmount > 0;

  const handleOpenUPIApp = async (appId: string) => {
    if (!canPay) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    try {
      await setPreferredUPIApp(appId);

      const pendingId = `pending_${Date.now()}`;

      // Save pending transaction with user's note
      await PendingManager.savePending({
        id: pendingId,
        paymentData: {
          upiId: paymentData.upiId,
          payeeName: paymentData.payeeName,
          amount: currentAmount,
          transactionNote: transactionNote || paymentData.transactionNote,
          rawParams: rawParams
        },
        category: category,
        reason: transactionNote || paymentData.transactionNote,
        timestamp: Date.now(),
        status: 'pending',
        launchedApp: appId
      });

      // Check if GPay - use silent QR share method
      const isGPay = appId.includes('gpay') || appId.includes('tez') || appId === 'com.google.android.apps.nbu.paisa.user';

      if (isGPay) {
        // Use silent QR image share for GPay
        const success = await shareQRToGPay({
          upiId: paymentData.upiId,
          payeeName: paymentData.payeeName,
          amount: currentAmount,
          transactionNote: transactionNote || paymentData.transactionNote,
        });

        if (!success) {
          // Fallback to standard UPI intent if QR share fails
          const upiUrl = buildUPIUrl({
            upiId: paymentData.upiId,
            payeeName: paymentData.payeeName,
            amount: currentAmount,
            transactionNote: transactionNote || paymentData.transactionNote,
            rawParams: rawParams,
          });
          await openUPIApp(appId, upiUrl);
        }
      } else {
        // For other apps, use standard UPI intent
        const upiUrl = buildUPIUrl({
          upiId: paymentData.upiId,
          payeeName: paymentData.payeeName,
          amount: currentAmount,
          transactionNote: transactionNote || paymentData.transactionNote,
          rawParams: rawParams,
        });
        await openUPIApp(appId, upiUrl);
      }

      // Tracking is handled by AppState in the hook automatically

    } catch (error) {
      console.error('Payment failed:', error);
      Alert.alert('Error', 'Could not open UPI app');
      setIsLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    try {
      const activePendings = await PendingManager.getPendings(); // Correct method: getPendings

      if (activePendings.length > 0) {
        // Find matching pending
        const pending = activePendings.find(p => Math.abs((p.paymentData.amount || 0) - currentAmount) < 0.1);
        const targetPending = pending || activePendings[0];

        // Prefer the NOTE from the pending transaction, as component state might have reset if app restarted
        const finalNote = targetPending.reason || targetPending.paymentData.transactionNote || transactionNote;
        // Prefer the CATEGORY from the pending transaction
        const finalCategory = targetPending.category || category;

        // Save using CORRECT positional arguments
        // saveTransaction(paymentData, category, reason, amount, launchedAt)
        await saveTransaction(
          {
            upiId: paymentData.upiId,
            payeeName: paymentData.payeeName,
            amount: currentAmount,
            transactionNote: finalNote || paymentData.transactionNote, // Persist note in data
            rawParams
          },
          finalCategory,
          finalNote || paymentData.transactionNote || `Paid to ${paymentData.payeeName}`, // Reason field
          currentAmount,
          targetPending.timestamp
        );

        // Resolve pending state
        await PendingManager.resolvePending(targetPending.id, 'confirmed');
      } else {
        // Even if no pending found (rare), still save tx
        await saveTransaction(
          {
            upiId: paymentData.upiId,
            payeeName: paymentData.payeeName,
            amount: currentAmount,
            transactionNote: transactionNote || paymentData.transactionNote,
            rawParams
          },
          category,
          transactionNote || paymentData.transactionNote || `Paid to ${paymentData.payeeName}`,
          currentAmount,
          Date.now()
        );
      }

      router.replace('/(tabs)');
    } catch (error) {
      console.error("Error saving transaction", error);
      Alert.alert("Error", "Could not save transaction.");
    }
  };

  const handleCancelPayment = async () => {
    const activePendings = await PendingManager.getPendings();
    const pending = activePendings.find(p => Math.abs((p.paymentData.amount || 0) - currentAmount) < 0.1);
    const idToResolve = pending ? pending.id : (activePendings[0]?.id);

    if (idToResolve) {
      await PendingManager.resolvePending(idToResolve, 'cancelled');
    }

    hideConfirmation(); // Correct hook method
    router.replace('/'); // Go home
  };

  if (showQRGenerator) {
    const upiUrl = buildUPIUrl({
      upiId: paymentData.upiId,
      payeeName: paymentData.payeeName,
      amount: parseFloat(amount) || 0,
      transactionNote: paymentData.transactionNote,
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

  // Fallback for "Select App" manual click or "More" button
  const showManualAppSelector = () => {
    Alert.alert(
      'Select Payment App',
      'Choose an app to pay with:',
      [
        ...installedApps.map((app: UPIAppInfo) => ({
          text: app.name,
          onPress: () => handleOpenUPIApp(app.id)
        })),
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  // Default to GPay for slide-to-pay
  const gpayApp = installedApps.find(a => a.id.includes('gpay') || a.id.includes('tez') || a.name.toLowerCase().includes('google'));
  const primaryApp = gpayApp || installedApps[0];

  // Helper to get brand icon
  const getAppIcon = (app: UPIAppInfo, size = 24) => {
    const id = app.id.toLowerCase();
    const name = app.name.toLowerCase();
    if (id.includes('phonepe') || name.includes('phonepe')) return <PhonePeIcon size={size} />;
    if (id.includes('tez') || id.includes('google') || name.includes('gpay')) return <GPayIcon size={size} />;
    return <Ionicons name="wallet-outline" size={size * 0.75} color={colors.text} />;
  };

  // Use theme background

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

        {/* 1. Header Section */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.payeeName, { color: colors.text }]}>
              {paymentData.payeeName}
            </Text>
            <TouchableOpacity
              style={styles.vpaContainer}
              onPress={() => Alert.alert('Copied', paymentData.upiId)}
            >
              <Text style={[styles.vpaText, { color: colors.textSecondary }]}>
                {paymentData.upiId}
              </Text>
              <Ionicons name="copy-outline" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Secure Mode Banner */}
        <View style={[styles.secureBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={14} color={colors.success} />
          <Text style={[styles.secureText, { color: colors.text }]}>Secure Payment Mode</Text>
        </View>

        {/* 2. Main Content (Centered) */}
        <View style={styles.mainContent}>

          {/* Amount (Centered & Large) */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.currencySymbol, { color: colors.text }]}>₹</Text>
              <TextInput
                style={[
                  styles.amountInput,
                  { color: colors.text }
                ]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
          </View>

          {/* Category Chips (Horizontal Scroll) */}
          <View style={{ height: 50 }}>
            <CategoryPicker
              selectedCategory={category}
              onSelectCategory={setCategory}
              mode="chips"
            />
          </View>

          {/* Transaction Note (Optional) */}
          <View style={styles.noteContainer}>
            <TextInput
              style={[styles.noteInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
              value={transactionNote}
              onChangeText={setTransactionNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textSecondary}
              maxLength={100}
            />
          </View>

        </View>

        {/* 3. Footer Actions (Bottom Pinned) */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>

          {/* Primary Slide Action */}
          <View style={styles.slideContainer}>
            {installedApps.length > 0 ? (
              <SlideToPay
                appName={primaryApp?.name || "UPI App"}
                onSuccess={() => handleOpenUPIApp(primaryApp?.id || installedApps[0].id)}
                disabled={!canPay}
                width="100%"
              />
            ) : (
              /* Fallback Button if no apps detected */
              <TouchableOpacity
                style={[styles.fallbackButton, { backgroundColor: canPay ? colors.tint : colors.border }]}
                onPress={showManualAppSelector}
                disabled={!canPay}
              >
                <Text style={styles.fallbackButtonText}>Pay Now</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Horizontal App Icons Row - Simplified: PhonePe + QR only */}
          <View style={styles.appIconsRow}>
            {/* PhonePe Button */}
            {installedApps.find(a => a.id.includes('phonepe')) && (
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => handleOpenUPIApp('com.phonepe.app')}
              >
                <PhonePeIcon size={18} />
                <Text style={[styles.iconLabel, { color: colors.text }]}>PhonePe</Text>
              </TouchableOpacity>
            )}

            {/* QR Button */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => setShowQRGenerator(true)}
            >
              <QRIcon size={18} />
              <Text style={[styles.iconLabel, { color: colors.text }]}>QR</Text>
            </TouchableOpacity>
          </View>

        </View>

      </View>

      <ConfirmationModal
        visible={showConfirmation}
        amount={amount}
        payeeName={paymentData.payeeName}
        note={transactionNote || paymentData.transactionNote}
        confidenceScore={confidenceScore}
        onConfirm={handleConfirmPayment}
        onCancel={handleCancelPayment}
        onMaybe={() => {
          hideConfirmation();
          router.replace('/');
        }}
      />
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
    paddingBottom: Spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  payeeName: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: 2,
  },
  vpaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vpaText: {
    fontSize: FontSizes.sm,
  },
  secureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginTop: Spacing.xs,
    gap: 6,
  },
  secureText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100, // Visual offset
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.md,
  },
  currencySymbol: {
    fontSize: 40,
    fontWeight: '700',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 56,
    fontWeight: '700',
    minWidth: 120, // ensure width for typing
    padding: 0,
  },
  categoryContainer: {
    // This container holds the dropdown
  },
  footer: {
    paddingHorizontal: Spacing.lg,
  },
  slideContainer: {
    marginBottom: Spacing.lg,
    height: 60, // Fixed height for consistency
  },
  fallbackButton: {
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackButtonText: {
    color: '#fff',
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  appIconsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    gap: 8,
  },
  iconLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  noteContainer: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  noteInput: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: FontSizes.md,
    textAlign: 'center',
  },
});
