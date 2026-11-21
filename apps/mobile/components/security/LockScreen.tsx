import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { FontSizes, Spacing } from '@/constants/theme';
import { useSecurity } from '@/contexts/security-context';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** Shown instead of the app while it is locked. Prompts once on appearance, and again on demand. */
export function LockScreen() {
  const colors = useThemeColors();
  const { authenticate } = useSecurity();

  useEffect(() => {
    void authenticate();
    // Prompt once when the lock screen appears; further attempts are user-initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Ionicons name="lock-closed" size={64} color={colors.tint} />
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        SpentSmart is locked
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Unlock with your fingerprint, face or device passcode.</Text>
      <Button label="Unlock" onPress={() => void authenticate()} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  title: { fontSize: FontSizes.xxl, fontWeight: '700', marginTop: Spacing.md },
  subtitle: { fontSize: FontSizes.md, textAlign: 'center' },
  button: { marginTop: Spacing.lg, minWidth: 200 },
});
