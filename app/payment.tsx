import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HiddenQrRenderer } from '@/components/payment/HiddenQrRenderer';
import { AttemptReview } from '@/components/payment/AttemptReview';
import { QRPaymentGenerator } from '@/components/payment/QRPaymentGenerator';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SlideToPay } from '@/components/ui/SlideToPay';
import { GPAY_PACKAGE } from '@/constants/upi-apps';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { useSettings } from '@/contexts/settings-context';
import { PaymentAttempt } from '@/db/repositories/attempts';
import { Paise, paiseToDecimal, parseRupees } from '@/domain/money';
import { PaymentDraft, draftFromParams } from '@/domain/payment-draft';
import { buildPayUri } from '@/domain/upi/build';
import { parseUpiResponse } from '@/domain/upi/response';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { clearPaymentDraft, peekPaymentDraft } from '@/lib/payment-draft-store';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { UpiAppChoice, beginGooglePayQrShare, beginPayment, beginQrGalleryPayment, hasNativeUpi, listUpiApps, openAppLauncher } from '@/services/payments';

export default function PaymentScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const { settings, setSetting } = useSettings();
  const params = useLocalSearchParams();

  // The scanner hands over a validated draft; manual entry / deep links go through strict param validation.
  const draft: PaymentDraft | null = useMemo(() => peekPaymentDraft() ?? draftFromParams(params), [params]);
  useEffect(() => () => clearPaymentDraft(), []);

  const [amountText, setAmountText] = useState(draft?.amountPaise !== undefined ? paiseToDecimal(draft.amountPaise) : '');
  const [note, setNote] = useState(draft?.note ?? '');
  const [categoryKey, setCategoryKey] = useState(draft?.categoryKey ?? 'food');
  const [apps, setApps] = useState<UpiAppChoice[] | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<PaymentAttempt | null>(null);
  const [recording, setRecording] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const qrResolver = useRef<((png: string | null) => void) | null>(null);
  const awaitingReturn = useRef<string | null>(null);

  const amountPaise: Paise | null = parseRupees(amountText);
  const canPay = amountPaise !== null && draft !== null;
  // Shops can be paid by a direct intent; personal UPI IDs cannot (see payViaGalleryQr).
  const directFirst = draft?.source?.isMerchant === true;

  useEffect(() => {
    let alive = true;
    listUpiApps().then((found) => {
      if (!alive) return;
      setApps(found);
      const preferred = found.find((a) => a.packageName === settings.preferredUpiApp) ?? found.find((a) => a.packageName === GPAY_PACKAGE) ?? found[0];
      setSelectedApp(preferred?.packageName ?? null);
    });
    return () => {
      alive = false;
    };
    // Detect apps once; the preferred app is only a default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Some UPI apps give no result. When the user comes back to SpentSmart, ask them what happened.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      const id = awaitingReturn.current;
      if (state !== 'active' || !id) return;
      awaitingReturn.current = null;
      try {
        await repos.attempts.markReturned(id, { suggestion: 'unsure', response: null });
        setReview(await repos.attempts.get(id));
      } catch (error) {
        log.error('Could not open payment review', error);
      }
    });
    return () => sub.remove();
  }, [repos]);

  const startPayment = useCallback(
    async (options: { packageName: string | null; withoutAmount?: boolean }) => {
      if (!draft || amountPaise === null || busy) return;
      setBusy(true);
      try {
        if (options.packageName) await setSetting('preferredUpiApp', options.packageName).catch(() => undefined);
        const result = await beginPayment(repos, {
          draft,
          amountPaise,
          note: note.trim() || undefined,
          categoryKey,
          appPackage: options.packageName,
          withoutAmount: options.withoutAmount,
        });

        switch (result.launch.kind) {
          case 'result':
            setReview(result.attempt);
            break;
          case 'launched_without_result':
            awaitingReturn.current = result.attempt.id;
            break;
          case 'no_app':
            Alert.alert('No UPI app found', 'Install a UPI app such as Google Pay, PhonePe or Paytm, or pay with the QR code instead.');
            setResetToken((n) => n + 1);
            break;
          case 'error':
            Alert.alert('Could not open the UPI app', 'Please try again, or pay with the QR code instead.');
            setResetToken((n) => n + 1);
            break;
        }
      } catch (error) {
        log.error('Payment could not be started', error);
        Alert.alert('Error', 'The payment could not be started. Nothing was charged.');
        setResetToken((n) => n + 1);
      } finally {
        setBusy(false);
      }
    },
    [draft, amountPaise, busy, note, categoryKey, repos, setSetting],
  );

  /** One-tap personal payment: send the QR image to Google Pay. Falls back to the gallery route if that fails. */
  const payViaGooglePay = useCallback(async () => {
    if (!draft || amountPaise === null || busy) return;
    setBusy(true);
    let shared = false;
    try {
      const outcome = await beginGooglePayQrShare(repos, {
        draft,
        amountPaise,
        note: note.trim() || undefined,
        categoryKey,
        appPackage: GPAY_PACKAGE,
        renderQr: () =>
          new Promise<string | null>((resolve) => {
            qrResolver.current = resolve;
            // Plain personal-payment QR: no transaction reference, or UPI apps treat it as a shop payment.
            setQrValue(buildPayUri({ vpa: draft.vpa, payeeName: draft.payeeName, amountPaise, note: note.trim() || undefined, source: draft.source }));
            setTimeout(() => resolve(null), 4000);
          }),
      });
      if (outcome.kind === 'ready') {
        awaitingReturn.current = outcome.attempt.id;
        shared = true;
      }
    } finally {
      setBusy(false);
    }
    if (!shared) await payViaGalleryQrRef.current(GPAY_PACKAGE);
  }, [draft, amountPaise, busy, note, categoryKey, repos]);

  /**
   * Personal UPI IDs can't be paid by an intent from another app (UPI apps show the payee but won't continue).
   * An ordinary QR scan is accepted, so: save the QR to the gallery, open the UPI app, and let the user import it.
   */
  const payViaGalleryQr = useCallback(
    async (packageName: string | null) => {
      if (!draft || amountPaise === null || busy) return;
      setBusy(true);
      try {
        const outcome = await beginQrGalleryPayment(repos, {
          draft,
          amountPaise,
          note: note.trim() || undefined,
          categoryKey,
          appPackage: packageName,
          renderQr: () =>
            new Promise<string | null>((resolve) => {
              qrResolver.current = resolve;
              setQrValue(buildPayUri({ vpa: draft.vpa, payeeName: draft.payeeName, amountPaise, note: note.trim() || undefined, source: draft.source }));
              setTimeout(() => resolve(null), 4000);
            }),
        });

        if (outcome.kind === 'permission_denied') {
          Alert.alert('Permission needed', 'Allow saving photos so the payment QR can be saved to your gallery. SpentSmart cannot read your photos.');
          setResetToken((n) => n + 1);
          return;
        }
        if (outcome.kind === 'failed') {
          Alert.alert('Could not create the QR', 'Try “Show QR code” and scan it from another phone, or enter the payment in your UPI app.');
          setResetToken((n) => n + 1);
          return;
        }

        const appName = apps?.find((a) => a.packageName === packageName)?.name ?? 'your UPI app';
        awaitingReturn.current = outcome.attempt.id;
        Alert.alert(
          'QR saved to your gallery',
          `In ${appName}: tap Scan, then choose the gallery/upload option and pick the newest image. Then pay. Come back here afterwards to confirm.`,
          [
            {
              text: `Open ${appName}`,
              onPress: () => {
                if (packageName) void openAppLauncher(packageName);
              },
            },
          ],
        );
      } finally {
        setBusy(false);
      }
    },
    [draft, amountPaise, busy, note, categoryKey, repos, apps],
  );

  const payViaGalleryQrRef = useRef<(packageName: string | null) => Promise<void>>(async () => undefined);
  payViaGalleryQrRef.current = payViaGalleryQr;

  const handleQrReady = useCallback((png: string) => {
    qrResolver.current?.(png);
    qrResolver.current = null;
  }, []);

  const record = async (attempt: PaymentAttempt, paid: Paise) => {
    setRecording(true);
    try {
      const response = parseUpiResponse(attempt.response);
      await repos.attempts.record(
        attempt.id,
        { amountPaise: paid, categoryKey, note: note.trim() || null },
        response.outcome === 'success' ? 'upi_result' : 'user',
        { id: response.txnId, ref: response.txnRef },
      );
      setReview(null);
      router.replace(routes.home);
    } catch (error) {
      log.error('Could not record payment', error);
      Alert.alert('Error', 'The payment could not be saved. Please try again.');
    } finally {
      setRecording(false);
    }
  };

  const discard = async (attempt: PaymentAttempt) => {
    await repos.attempts.discard(attempt.id);
    setReview(null);
    setResetToken((n) => n + 1);
  };

  const snooze = async (attempt: PaymentAttempt) => {
    await repos.attempts.snooze(attempt.id);
    setReview(null);
    router.replace(routes.home);
  };

  const retryViaQr = async (attempt: PaymentAttempt) => {
    await repos.attempts.discard(attempt.id);
    setReview(null);
    await payViaGalleryQr(attempt.appPackage);
  };

  const retryWithoutAmount = async (attempt: PaymentAttempt) => {
    await repos.attempts.discard(attempt.id);
    setReview(null);
    await startPayment({ packageName: attempt.appPackage, withoutAmount: true });
  };

  if (!draft) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Payment" leading="close" />
        <View style={styles.invalid}>
          <Ionicons name="warning-outline" size={48} color={colors.warning} />
          <Text style={[styles.invalidTitle, { color: colors.text }]}>This payment link isn’t valid</Text>
          <Text style={[styles.invalidText, { color: colors.textSecondary }]}>It is missing a valid UPI ID or has an invalid amount, so it was not opened.</Text>
          <Button label="Go back" onPress={() => router.back()} style={styles.wide} />
        </View>
      </View>
    );
  }

  if (showQr) {
    const uri = buildPayUri({ vpa: draft.vpa, payeeName: draft.payeeName, amountPaise: amountPaise ?? undefined, note: note.trim() || undefined, source: draft.source });
    return (
      <QRPaymentGenerator
        upiUrl={uri}
        payeeName={draft.payeeName}
        upiId={draft.vpa}
        amountPaise={amountPaise ?? undefined}
        onClose={() => setShowQr(false)}
        onPaidViaQr={async () => {
          if (amountPaise === null) {
            Alert.alert('Enter an amount', 'Enter the amount you paid first.');
            setShowQr(false);
            return;
          }
          const attempt = await repos.attempts.create({ vpa: draft.vpa, payeeName: draft.payeeName, amountPaise, note: note.trim() || null, categoryKey, appPackage: null, txnRef: null });
          setShowQr(false);
          setReview(attempt);
        }}
      />
    );
  }

  const selected = apps?.find((a) => a.packageName === selectedApp);
  const canEditAmount = draft.amountEditable;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={draft.payeeName} leading="close" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.vpa, { color: colors.textSecondary }]} selectable accessibilityLabel={`UPI ID ${draft.vpa}`}>
          {draft.vpa}
        </Text>
        <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name={draft.source?.isMerchant ? 'storefront-outline' : 'person-outline'} size={16} color={colors.textSecondary} />
          <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
            The name comes from the QR code and isn’t verified. Check the UPI ID before you pay.
          </Text>
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
            editable={canEditAmount}
            autoFocus={canEditAmount && !amountText}
          />
        </View>
        {amountText !== '' && amountPaise === null ? (
          <Text style={[styles.error, { color: colors.error }]}>Enter an amount like 250 or 250.50 (up to ₹1 crore).</Text>
        ) : null}
        {!canEditAmount ? <Text style={[styles.fixed, { color: colors.textSecondary }]}>The amount is set by the merchant’s QR code.</Text> : null}

        <View style={styles.section}>
          <CategoryPicker selectedCategory={categoryKey} onSelectCategory={setCategoryKey} mode="chips" exclude={['income']} />
        </View>

        <TextInput
          accessibilityLabel="Note"
          style={[styles.note, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          value={note}
          onChangeText={setNote}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textSecondary}
          maxLength={80}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {apps === null ? (
          <ActivityIndicator color={colors.tint} />
        ) : apps.length > 0 ? (
          <>
            <SlideToPay appName={selected?.name ?? 'UPI app'} disabled={!canPay || busy} resetToken={resetToken} onSuccess={() => void (directFirst ? startPayment({ packageName: selected?.packageName ?? null }) : selected?.packageName === GPAY_PACKAGE && hasNativeUpi ? payViaGooglePay() : payViaGalleryQr(selected?.packageName ?? null))} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.appRow} keyboardShouldPersistTaps="handled">
              {apps.map((app) => {
                const active = app.packageName === selectedApp;
                return (
                  <TouchableOpacity
                    key={app.packageName}
                    accessibilityRole="radio"
                    accessibilityLabel={`Pay with ${app.name}`}
                    accessibilityState={{ selected: active }}
                    style={[styles.appChip, { backgroundColor: active ? colors.tint : colors.card, borderColor: active ? colors.tint : colors.border }]}
                    onPress={() => setSelectedApp(app.packageName)}
                  >
                    <Text style={{ color: active ? colors.onTint : colors.text, fontSize: FontSizes.sm, fontWeight: '600' }}>{app.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <Button label="Choose a UPI app" disabled={!canPay || busy} loading={busy} onPress={() => void (directFirst ? startPayment({ packageName: null }) : payViaGalleryQr(null))} />
        )}

        {!directFirst && apps !== null ? (
          <Text style={[styles.fixed, { color: colors.textSecondary }]}>
            Personal UPI IDs can’t be paid straight from another app. SpentSmart saves a QR to your gallery; you import it in your UPI app.
          </Text>
        ) : null}

        <View style={styles.altRow}>
          <Button label="Show QR code" variant="secondary" onPress={() => setShowQr(true)} style={styles.flex} disabled={busy} />
          <Button
            label={directFirst ? 'Pay via QR' : 'Try direct'}
            variant="secondary"
            onPress={() => void (directFirst ? payViaGalleryQr(selected?.packageName ?? null) : startPayment({ packageName: selected?.packageName ?? null }))}
            style={styles.flex}
            disabled={!canPay || busy}
            accessibilityLabel={directFirst ? 'Pay by saving a QR code to the gallery' : 'Try paying directly in the UPI app'}
          />
        </View>
        {apps !== null && apps.length > 0 ? (
          <Button
            label="Use another UPI app…"
            variant="ghost"
            disabled={!canPay || busy}
            onPress={() => void (directFirst ? startPayment({ packageName: null }) : payViaGalleryQr(null))}
          />
        ) : null}
      </View>

      <Modal visible={review !== null} transparent animationType="slide" onRequestClose={() => review && void snooze(review)}>
        <View style={[styles.modalScrim, { backgroundColor: colors.scrim }]}>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {review ? (
              <AttemptReview
                attempt={review}
                busy={recording}
                onRecord={(paid) => void record(review, paid)}
                onDiscard={() => void discard(review)}
                onSnooze={() => void snooze(review)}
                onRetryWithoutAmount={!draft.source?.isSigned && review.amountPaise !== null ? () => void retryWithoutAmount(review) : undefined}
                onPayViaQr={() => void retryViaQr(review)}
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {qrValue ? <HiddenQrRenderer value={qrValue} onReady={handleQrReady} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  wide: { alignSelf: 'stretch' },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, alignItems: 'stretch', gap: Spacing.md },
  vpa: { textAlign: 'center', fontSize: FontSizes.sm },
  banner: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1 },
  bannerText: { flex: 1, fontSize: FontSizes.xs },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.lg },
  currency: { fontSize: 40, fontWeight: '700', marginRight: 4 },
  amountInput: { fontSize: 56, fontWeight: '700', minWidth: 120, padding: 0 },
  error: { textAlign: 'center', fontSize: FontSizes.xs },
  fixed: { textAlign: 'center', fontSize: FontSizes.xs },
  section: { minHeight: 56 },
  note: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, minHeight: 48, fontSize: FontSizes.md, textAlign: 'center' },
  footer: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  appRow: { gap: Spacing.sm, paddingVertical: 4 },
  appChip: { minHeight: MIN_TOUCH_TARGET - 8, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, justifyContent: 'center' },
  altRow: { flexDirection: 'row', gap: Spacing.sm },
  invalid: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  invalidTitle: { fontSize: FontSizes.xl, fontWeight: '700', textAlign: 'center' },
  invalidText: { fontSize: FontSizes.md, textAlign: 'center' },
  modalScrim: { flex: 1, justifyContent: 'flex-end' },
  modalBody: { flexGrow: 1, justifyContent: 'flex-end', padding: Spacing.md },
});
