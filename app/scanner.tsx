import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { draftFromParsed } from '@/domain/payment-draft';
import { PARSE_FAILURE_MESSAGES, parseUpiUri } from '@/domain/upi/parse';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { setPaymentDraft } from '@/lib/payment-draft-store';
import { routes } from '@/lib/routes';

const SCAN_AREA = Dimensions.get('window').width * 0.7;

export default function ScannerScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const handling = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const handleScan = (result: BarcodeScanningResult) => {
    if (handling.current) return;
    handling.current = true;

    const parsed = parseUpiUri(result.data);
    if (parsed.ok) {
      setPaymentDraft(draftFromParsed(parsed.data));
      router.replace(routes.payment);
      return;
    }
    Alert.alert('Can’t use this QR code', PARSE_FAILURE_MESSAGES[parsed.reason], [
      { text: 'Scan again', onPress: () => (handling.current = false) },
      { text: 'Close', style: 'cancel', onPress: () => router.back() },
    ]);
  };

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.message, { color: colors.text }]}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.shield, { backgroundColor: colors.surface }]}>
          <Ionicons name="camera-outline" size={64} color={colors.text} />
        </View>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          Camera access needed
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          SpentSmart uses the camera only to read UPI QR codes. Images are never saved or sent anywhere.
        </Text>
        <Button label="Allow camera" onPress={() => void requestPermission()} style={styles.wide} />
        <Button label="Go back" variant="secondary" onPress={() => router.back()} style={styles.wide} />
      </View>
    );
  }

  return (
    <View style={styles.camera}>
      <StatusBar style="light" />
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          enableTorch={torch}
          onBarcodeScanned={handleScan}
        />
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.shade, styles.topBar, { paddingTop: insets.top }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close scanner" style={styles.roundButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'}
            style={styles.roundButton}
            onPress={() => setTorch((v) => !v)}
          >
            <Ionicons name={torch ? 'flash' : 'flash-off'} size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.middle}>
          <View style={styles.shade} />
          <View style={styles.scanArea}>
            {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((corner) => (
              <View key={corner} style={[styles.corner, styles[corner]]} />
            ))}
          </View>
          <View style={styles.shade} />
        </View>

        <View style={[styles.shade, styles.bottom]}>
          <Text style={styles.instruction}>Point your camera at a UPI QR code</Text>
        </View>
      </View>
    </View>
  );
}

const CORNER = { position: 'absolute' as const, width: 30, height: 30, borderColor: '#3B82F6', borderWidth: 4 };

const styles = StyleSheet.create({
  camera: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  shield: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  title: { fontSize: FontSizes.xl, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: FontSizes.md, textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  shade: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, alignItems: 'flex-start' },
  middle: { flexDirection: 'row', height: SCAN_AREA },
  scanArea: { width: SCAN_AREA, height: SCAN_AREA },
  bottom: { alignItems: 'center' },
  roundButton: { width: 48, height: 48, borderRadius: BorderRadius.full, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  instruction: { color: '#FFFFFF', fontSize: FontSizes.md, textAlign: 'center', marginTop: Spacing.xl },
  corner: CORNER,
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
});
