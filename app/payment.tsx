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

export default function PaymentScreen() {
  const params = useLocalSearchParams<{
    upiId: string;
    payeeName: string;
    amount: string;
    transactionNote: string;
    rawParams?: string;
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
  const [category, setCategory] = useState<CategoryType>('food'); // Default category
  const [isLoading, setIsLoading] = useState(false);
  const [installedApps, setInstalledApps] = useState<UPIAppInfo[]>([]);
  const [preferredApp, setPreferredApp] = useState<string | null>(null);
  const [showQRGenerator, setShowQRGenerator] = useState(false);

  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const { showConfirmation, confidenceScore, hideConfirmation } = usePaymentConfirmation();

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

      // Save pending transaction CORRECTLY
      await PendingManager.savePending({
        id: pendingId,
        paymentData: {
          upiId: paymentData.upiId,
          payeeName: paymentData.payeeName,
          amount: currentAmount,
          transactionNote: paymentData.transactionNote,
          rawParams: rawParams
        },
        category: category,
        reason: paymentData.transactionNote,
        timestamp: Date.now(),
        status: 'pending',
        launchedApp: appId
      });


      // Construct UPI Intent URL
      const upiUrl = buildUPIUrl({
        upiId: paymentData.upiId,
        payeeName: paymentData.payeeName,
        amount: currentAmount,
        transactionNote: paymentData.transactionNote,
        rawParams: rawParams,
      });

      await openUPIApp(appId, upiUrl);

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

        // Save using CORRECT positional arguments
        // saveTransaction(paymentData, category, reason, amount, launchedAt)
        await saveTransaction(
          {
            upiId: paymentData.upiId,
            payeeName: paymentData.payeeName,
            amount: currentAmount,
            transactionNote: paymentData.transactionNote,
            rawParams
          },
          category,
          paymentData.transactionNote || `Paid to ${paymentData.payeeName}`,
          currentAmount,
          pending ? pending.timestamp : Date.now()
        );

        // Resolve pending state
        if (pending) {
          await PendingManager.resolvePending(pending.id, 'confirmed');
        } else {
          await PendingManager.resolvePending(activePendings[0].id, 'confirmed');
        }
      } else {
        // Even if no pending found (rare), still save tx
        await saveTransaction(
          {
            upiId: paymentData.upiId,
            payeeName: paymentData.payeeName,
            amount: currentAmount,
            transactionNote: paymentData.transactionNote,
            rawParams
          },
          category,
          paymentData.transactionNote || `Paid to ${paymentData.payeeName}`,
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

  const primaryApp = preferredApp ? installedApps.find(a => a.id === preferredApp) || installedApps[0] : installedApps[0];
  const secondaryApps = installedApps.filter(a => a.id !== primaryApp?.id);
  const showMoreApps = secondaryApps.length > 2;
  const visibleSecondaryApps = showMoreApps ? secondaryApps.slice(0, 1) : secondaryApps.slice(0, 2);

  // Helper to get brand icon
  const getAppIcon = (app: UPIAppInfo, size = 24) => {
    const id = app.id.toLowerCase();
    const name = app.name.toLowerCase();
    if (id.includes('phonepe') || name.includes('phonepe')) return <PhonePeIcon size={size} />;
    if (id.includes('tez') || id.includes('google') || name.includes('gpay')) return <GPayIcon size={size} />;
    return <Ionicons name="wallet-outline" size={size * 0.75} color={colors.text} />;
  };

  // Match home/charts background
  const backgroundColor = colorScheme === 'dark' ? '#1E3A8A' : '#3B82F6';

  return (
    <>
      <View style={[styles.container, { backgroundColor }]}>
        <StatusBar style="light" />

        {/* 1. Header Section */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.payeeName, { color: '#FFF' }]}>
              {paymentData.payeeName}
            </Text>
            <TouchableOpacity
              style={styles.vpaContainer}
              onPress={() => Alert.alert('Copied', paymentData.upiId)}
            >
              <Text style={[styles.vpaText, { color: 'rgba(255, 255, 255, 0.7)' }]}>
                {paymentData.upiId}
              </Text>
              <Ionicons name="copy-outline" size={12} color="rgba(255, 255, 255, 0.7)" />
            </TouchableOpacity>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Secure Mode Banner */}
        <View style={[styles.secureBanner, { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name="shield-checkmark" size={14} color="#4ADE80" />
          <Text style={[styles.secureText, { color: '#FFF' }]}>Secure Payment Mode</Text>
        </View>

        {/* 2. Main Content (Centered) */}
        <View style={styles.mainContent}>

          {/* Amount (Centered & Large) */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.currencySymbol, { color: '#FFF' }]}>₹</Text>
              <TextInput
                style={[
                  styles.amountInput,
                  {
                    color: '#FFF',
                    textShadowColor: 'rgba(0, 0, 0, 0.2)',
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 4
                  }
                ]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
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

          {/* Horizontal App Icons Row */}
          <View style={styles.appIconsRow}>
            {/* Visible Secondary Apps */}
            {visibleSecondaryApps.map(app => (
              <TouchableOpacity
                key={app.id}
                style={[styles.iconButton, { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}
                onPress={() => handleOpenUPIApp(app.id)}
              >
                <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
                  {getAppIcon(app)}
                </View>
                <Text style={[styles.iconLabel, { color: '#FFF' }]}>{app.name}</Text>
              </TouchableOpacity>
            ))}

            {/* "More" Button */}
            {showMoreApps && (
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}
                onPress={showManualAppSelector}
              >
                <Ionicons name="apps-outline" size={18} color="#FFF" />
                <Text style={[styles.iconLabel, { color: '#FFF' }]}>More</Text>
              </TouchableOpacity>
            )}

            {/* QR Button */}
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}
              onPress={() => setShowQRGenerator(true)}
            >
              <QRIcon size={18} />
              <Text style={[styles.iconLabel, { color: '#FFF' }]}>QR</Text>
            </TouchableOpacity>
          </View>

        </View>

      </View>

      <ConfirmationModal
        visible={showConfirmation}
        amount={amount}
        payeeName={paymentData.payeeName}
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
  }
});
