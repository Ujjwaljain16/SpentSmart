import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCard } from '@/components/home/BalanceCard';
import { FloatingScanButton } from '@/components/home/FloatingScanButton';
import { InsightsGrid } from '@/components/home/InsightsGrid';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/settings-context';
import { budgetUsage, Period } from '@/domain/periods';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';

export default function HomeScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<Period>('week');
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, refresh } = useLiveQuery(
    async (repos) => {
      const now = new Date();
      const [insights, monthly, open] = await Promise.all([
        repos.analytics.insights(period, now),
        repos.analytics.insights('month', now),
        repos.attempts.listOpen(),
      ]);
      return { insights, monthSpent: monthly.expensePaise, openAttempts: open.length };
    },
    [period],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const insights = data?.insights;
  const usage = data ? budgetUsage(data.monthSpent, settings.budgetPaise || null) : null;
  const greetingName = settings.profileName.trim().toLowerCase() || 'there';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} colors={[colors.tint]} progressBackgroundColor={colors.card} />}
      >
        {loading && !insights ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : insights ? (
          <>
            <View style={styles.greetingRow}>
              <Text style={[styles.greeting, { color: colors.text }]} accessibilityRole="header">
                hey, {greetingName}
              </Text>
              <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
                <Ionicons name={settings.avatarId as keyof typeof Ionicons.glyphMap} size={32} color={colors.text} />
              </View>
            </View>

            {data && data.openAttempts > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${data.openAttempts} payment${data.openAttempts === 1 ? '' : 's'} waiting for confirmation. Review now`}
                style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.warning }]}
                onPress={() => router.push(routes.recoverPending)}
              >
                <Ionicons name="help-circle" size={22} color={colors.warning} />
                <Text style={[styles.bannerText, { color: colors.text }]}>
                  {data.openAttempts} payment{data.openAttempts === 1 ? '' : 's'} waiting for confirmation
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}

            <BalanceCard
              balancePaise={insights.balancePaise}
              incomePaise={insights.incomePaise}
              expensePaise={insights.expensePaise}
              trend={insights.trend}
              period={period}
              onPeriodChange={setPeriod}
              budget={usage ? { budgetPaise: settings.budgetPaise, spentPaise: data!.monthSpent, usage } : null}
            />

            <View style={styles.quickRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add a transaction manually"
                style={[styles.quick, { backgroundColor: colors.card }]}
                onPress={() => router.push(routes.manualEntry)}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.tint }]}>
                  <Ionicons name="send-outline" size={20} color={colors.onTint} />
                </View>
                <Text style={[styles.quickLabel, { color: colors.text }]}>Transfer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Receive money"
                style={[styles.quick, { backgroundColor: colors.card }]}
                onPress={() => router.push(routes.receive)}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.success }]}>
                  <Ionicons name="download-outline" size={20} color={colors.onTint} />
                </View>
                <Text style={[styles.quickLabel, { color: colors.text }]}>Receive</Text>
              </TouchableOpacity>
            </View>

            {insights.expensePaise > 0 ? (
              <InsightsGrid categories={insights.categories} topPayees={insights.topPayees} />
            ) : (
              <View style={[styles.empty, { backgroundColor: colors.card }]}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No spending yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Scan a UPI QR code to log your first payment.</Text>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Unable to load data</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Pull to refresh</Text>
          </View>
        )}
      </ScrollView>

      <FloatingScanButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  greeting: { fontSize: FontSizes.xxl, fontWeight: 'bold' },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, minHeight: 48, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.lg },
  bannerText: { flex: 1, fontSize: FontSizes.sm, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, minHeight: 56, borderRadius: BorderRadius.lg, gap: Spacing.sm },
  quickIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: FontSizes.md, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.lg },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '600', marginBottom: 12 },
  emptySubtitle: { fontSize: FontSizes.md, textAlign: 'center', lineHeight: 22 },
});
