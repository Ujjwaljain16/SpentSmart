import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCard } from '@/components/home/BalanceCard';
import { FloatingScanButton } from '@/components/home/FloatingScanButton';
import { InsightsGrid } from '@/components/home/InsightsGrid';
import { SafeToSpendCard } from '@/components/home/SafeToSpendCard';
import { TransactionCard } from '@/components/transactions/transaction-card';
import { Money } from '@/components/ui/Money';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useCategories } from '@/contexts/categories-context';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/settings-context';
import { budgetUsage, Period } from '@spentsmart/finance/periods';
import { safeToSpend } from '@spentsmart/finance/safe-to-spend';
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
      const [insights, budgets, open, accounts, recent] = await Promise.all([
        repos.analytics.insights(period, now),
        repos.budgets.statuses(now),
        repos.attempts.listOpen(),
        repos.accounts.list(),
        repos.transactions.list({}, 5),
      ]);
      const overallBudget = budgets.find((b) => b.categoryKey === null) ?? null;
      // Balances only mean something once the user has entered at least one real starting balance; before that the
      // tracked figure is just "everything recorded", which would make safe-to-spend look broke.
      const spendable = accounts.filter((a) => a.type !== 'credit');
      const balancePaise = accounts.some((a) => a.openingBalancePaise !== 0)
        ? spendable.reduce((sum, a) => sum + a.balancePaise, 0)
        : null;
      const safe = safeToSpend({
        balancePaise,
        budgetRemainingPaise: overallBudget?.status.remainingPaise ?? null,
        payday: settings.payday || null,
        now,
      });
      const categoryBudgets = budgets
        .filter((b) => b.categoryKey !== null)
        .sort((a, b) => b.status.percent - a.status.percent)
        .slice(0, 3);
      return { insights, overallBudget, categoryBudgets, openAttempts: open.length, balancePaise, safe, recent: recent.items };
    },
    [period, settings.payday],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const insights = data?.insights;
  const overall = data?.overallBudget ?? null;
  const usage = overall ? budgetUsage(overall.status.spentPaise, overall.status.availablePaise) : null;
  const greetingName = settings.profileName.trim().toLowerCase() || 'there';
  const { resolve } = useCategories();

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

            {data ? (
              <SafeToSpendCard
                result={data.safe}
                balancePaise={data.balancePaise}
                onPressAccounts={() => router.push(routes.accounts)}
                onPressBudgets={() => router.push(routes.editBudget(null))}
              />
            ) : null}

            <BalanceCard
              balancePaise={insights.balancePaise}
              incomePaise={insights.incomePaise}
              expensePaise={insights.expensePaise}
              trend={insights.trend}
              period={period}
              onPeriodChange={setPeriod}
              budget={usage && overall ? { budgetPaise: overall.status.availablePaise, spentPaise: overall.status.spentPaise, usage } : null}
            />

            <View style={styles.quickRow}>
              {(
                [
                  { label: 'Quick add', icon: 'flash-outline', tone: colors.tint, a11y: 'Quick add a transaction by typing a phrase', to: routes.quickAdd },
                  { label: 'Transfer', icon: 'swap-horizontal', tone: colors.textSecondary, a11y: 'Move money between your accounts', to: routes.transfer },
                  { label: 'Receive', icon: 'download-outline', tone: colors.success, a11y: 'Receive money', to: routes.receive },
                ] as const
              ).map((q) => (
                <TouchableOpacity
                  key={q.label}
                  accessibilityRole="button"
                  accessibilityLabel={q.a11y}
                  style={[styles.quick, { backgroundColor: colors.card }]}
                  onPress={() => router.push(q.to)}
                >
                  <View style={[styles.quickIcon, { backgroundColor: q.tone }]}>
                    <Ionicons name={q.icon} size={20} color={colors.onTint} />
                  </View>
                  <Text style={[styles.quickLabel, { color: colors.text }]} numberOfLines={1}>
                    {q.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {data && data.categoryBudgets.length > 0 ? (
              <View style={[styles.section, { backgroundColor: colors.card }]}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open budgets" style={styles.sectionHeader} onPress={() => router.push(routes.budgets)}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Budgets</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                {data.categoryBudgets.map((b) => {
                  const label = resolve(b.categoryKey!).label;
                  return (
                    <View key={b.id} style={styles.budgetRow}>
                      <View style={styles.budgetText}>
                        <Text style={[styles.budgetName, { color: colors.text }]} numberOfLines={1}>
                          {label}
                        </Text>
                        <Money
                          paise={Math.max(0, b.status.remainingPaise)}
                          style={[styles.budgetLeft, { color: b.status.over ? colors.error : colors.textSecondary }]}
                        />
                      </View>
                      <ProgressBar percent={b.status.percent} accessibilityLabel={`${label} budget, ${b.status.percent} percent used`} />
                    </View>
                  );
                })}
              </View>
            ) : null}

            {data && data.recent.length > 0 ? (
              <View style={styles.recent}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="See all activity" style={styles.sectionHeader} onPress={() => router.push(routes.activity)}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent</Text>
                  <Text style={[styles.seeAll, { color: colors.tint }]}>See all</Text>
                </TouchableOpacity>
                {data.recent.map((t) => (
                  <TransactionCard key={t.id} transaction={t} onEdit={(tx) => router.push(routes.editTransaction(tx.id))} />
                ))}
              </View>
            ) : null}

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
  quick: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, minHeight: 72, borderRadius: BorderRadius.lg, gap: 6 },
  quickIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: FontSizes.sm, fontWeight: '600' },
  section: { borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.md, marginBottom: Spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  seeAll: { fontSize: FontSizes.sm, fontWeight: '700' },
  budgetRow: { gap: 6 },
  budgetText: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  budgetName: { flex: 1, fontSize: FontSizes.sm, fontWeight: '600' },
  budgetLeft: { fontSize: FontSizes.sm },
  recent: { gap: Spacing.sm, marginBottom: Spacing.xl },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.lg },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '600', marginBottom: 12 },
  emptySubtitle: { fontSize: FontSizes.md, textAlign: 'center', lineHeight: 22 },
});
