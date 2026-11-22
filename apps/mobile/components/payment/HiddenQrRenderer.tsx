import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface HiddenQrRendererProps {
  value: string;
  /** Called with a base64 PNG (no data-URL prefix) whenever `value` changes. */
  onReady: (base64Png: string) => void;
  size?: number;
}

/**
 * Renders a QR code off-screen purely to obtain its PNG. Everything happens on the device; no QR API,
 * no network, nothing about the payment leaves the phone.
 */
export function HiddenQrRenderer({ value, onReady, size = 512 }: HiddenQrRendererProps) {
  const ref = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => ref.current?.toDataURL((data) => onReady(data)), 50);
    return () => clearTimeout(handle);
  }, [value, onReady]);

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hidden}>
      <QRCode
        value={value}
        size={size}
        backgroundColor="white"
        color="black"
        quietZone={32}
        getRef={(c: unknown) => {
          ref.current = c as typeof ref.current;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
});
