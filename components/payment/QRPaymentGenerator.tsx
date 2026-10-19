import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { HiddenQrRenderer } from '@/components/payment/HiddenQrRenderer';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { Paise, formatPaise } from '@/domain/money';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { hasNativeUpi, shareQrToGooglePay } from '@/services/payments';

interface QRPaymentGeneratorProps {
  upiUrl: string;
  payeeName: string;
  upiId: string;
  amountPaise?: Paise;
  onClose: () => void;
  /** The user says they paid by scanning this QR in another app. */
  onPaidViaQr: () => void;
}

/**
 * Shows the payment as a QR the user can scan with any UPI app, or send to Google Pay as an image.
 * The image is generated locally.
 */
export function QRPaymentGenerator({ upiUrl, payeeName, upiId, amountPaise, onClose, onPaidViaQr }: QRPaymentGeneratorProps) {
  const colors = useThemeColors();
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handleReady = useCallback((data: string) => setPng(data), []);

  const shareToGPay = async () => {
    if (!png) return;
    setBusy(true);
    try {
      if (!(await shareQrToGooglePay(png))) {
        Alert.alert('Google Pay unavailable', 'Google Pay could not be opened. Scan the QR code from any UPI app instead.');
      }
    } finally {
      setBusy(false);
    }
  };

  const saveToGallery = async () => {
    if (!png) return;
    setBusy(true);
    const file = new File(Paths.cache, `spentsmart-qr-${Date.now()}.png`);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow saving photos to keep the QR code in your gallery.');
        return;
      }
      file.create({ overwrite: true });
      file.write(png.replace(/^data:image\/png;base64,/, ''), { encoding: 'base64' });
      await MediaLibrary.saveToLibraryAsync(file.uri);
      Alert.alert('Saved', 'Open your UPI app, choose “Scan from gallery”, and pick this QR code.');
    } catch (error) {
      log.warn('Saving QR failed', error);
      Alert.alert('Could not save', 'The QR code could not be saved to your gallery.');
    } finally {
      try {
        if (file.exists) file.delete();
      } catch {
        /* temp file cleanup is best effort */
      }
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Pay with a QR code" leading="close" onLeadingPress={onClose} bordered />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.qrCard}>
          <Text style={styles.qrTitle}>Scan in any UPI app</Text>
          <QRCode value={upiUrl} size={240} backgroundColor="white" color="black" />
          <Text style={styles.qrPayee}>{payeeName}</Text>
          <Text style={styles.qrVpa}>{upiId}</Text>
          {amountPaise ? <Text style={styles.qrAmount}>{formatPaise(amountPaise, { alwaysDecimals: true })}</Text> : null}
        </View>

        <View style={styles.actions}>
          {hasNativeUpi ? (
            <Button label="Send to Google Pay" accessibilityLabel="Send this QR code to Google Pay" disabled={!png} loading={busy} onPress={() => void shareToGPay()} />
          ) : null}
          <Button label="Save QR to gallery" variant="secondary" disabled={!png || busy} onPress={() => void saveToGallery()} />
          <Button label="I've paid" variant="secondary" accessibilityLabel="I paid using this QR code" onPress={onPaidViaQr} />
        </View>

        <View style={[styles.info, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={16} color={colors.tint} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>This QR code was created on your phone and was never uploaded.</Text>
        </View>
      </ScrollView>
      <HiddenQrRenderer value={upiUrl} onReady={handleReady} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, alignItems: 'center', gap: Spacing.lg },
  qrCard: { backgroundColor: '#FFFFFF', padding: Spacing.xl, borderRadius: BorderRadius.lg, alignItems: 'center', gap: Spacing.sm, elevation: 3 },
  qrTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: '#000000', marginBottom: Spacing.sm },
  qrPayee: { fontSize: FontSizes.md, fontWeight: '600', color: '#000000', marginTop: Spacing.sm },
  qrVpa: { fontSize: FontSizes.sm, color: '#555555' },
  qrAmount: { fontSize: FontSizes.xl, fontWeight: '700', color: '#000000' },
  actions: { width: '100%', gap: Spacing.sm },
  info: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1 },
  infoText: { flex: 1, fontSize: FontSizes.xs },
});
