import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttemptReview } from '@/components/payment/AttemptReview';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FontSizes, Spacing } from '@/constants/theme';
import { useRepos } from '@/contexts/database-context';
import { PaymentAttempt } from '@/db/repositories/attempts';
import { Paise } from '@/domain/money';
import { parseUpiResponse } from '@/domain/upi/response';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';

/** Payments you started but never confirmed (for example because the app was closed while paying). */
export default function RecoverPendingScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: attempts, loading } = useLiveQuery((r) => r.attempts.listOpen());

  const guard = async (id: string, task: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await task();
    } catch (error) {
      log.error('Resolving payment failed', error);
      Alert.alert('Error', 'That did not work. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const record = (attempt: PaymentAttempt, paid: Paise) =>
    guard(attempt.id, () => {
      const response = parseUpiResponse(attempt.response);
      return repos.attempts.record(attempt.id, { amountPaise: paid }, response.outcome === 'success' ? 'upi_result' : 'user', {
        id: response.txnId,
        ref: response.txnRef,
      });
    });

  const empty = !loading && (attempts?.length ?? 0) === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Confirm payments" bordered />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          You opened a UPI app but never told SpentSmart how it went. Confirm each payment, or decide later.
        </Text>

        {empty ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up</Text>
            <Button label="Back to home" onPress={() => router.replace(routes.home)} />
          </View>
        ) : null}

        {(attempts ?? []).map((attempt) => (
          <AttemptReview
            key={attempt.id}
            attempt={attempt}
            busy={busyId === attempt.id}
            onRecord={(paid) => void record(attempt, paid)}
            onDiscard={() => void guard(attempt.id, () => repos.attempts.discard(attempt.id))}
            onSnooze={() => void guard(attempt.id, () => repos.attempts.snooze(attempt.id))}
          />
        ))}

        {(attempts?.length ?? 0) > 1 ? <Button label="Decide all later" variant="ghost" onPress={() => void repos.attempts.snoozeAll().then(() => router.replace(routes.home))} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  subtitle: { fontSize: FontSizes.md, lineHeight: 22 },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '700' },
});
