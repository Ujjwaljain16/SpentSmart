import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionCard } from '@/components/transactions/transaction-card';
import { Money, useFormatMoney } from '@/components/ui/Money';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { isKnownIcon } from '@/domain/categories';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';

export default function AnalyticsDetailScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const key = String(category ?? '');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const format = useFormatMoney();
  const { resolve } = useCategories();
  const cat = resolve(key);

  const { data, loading } = useLiveQuery(
    async (repos) => {
      const [page, total, comparison] = await Promise.all([
        repos.transactions.list({ categoryKey: key }, 10),
        repos.analytics.categoryLifetimeTotal(key),
        repos.analytics.categoryComparison(key),
      ]);
      return { recent: page.items, total, comparison };
    },
    [key],
  );

  const icon = (isKnownIcon(cat.icon) ? cat.icon : 'pricetag') as keyof typeof Ionicons.glyphMap;
  const trend = data?.comparison.trend;
  const trendColor = trend?.direction === 'up' ? colors.error : trend?.direction === 'down' ? colors.success : colors.textSecondary;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title={`${cat.label} insights`} />

      {loading && !data ? (
        <ActivityIndicator color={colors.tint} style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}>
          <View style={styles.summary}>
            <View style={[styles.iconLarge, { backgroundColor: `${cat.color}33` }]}>
              <Ionicons name={icon} size={32} color={cat.color} />
            </View>
            <Money paise={data?.total ?? 0} style={[styles.total, { color: colors.text }]} />
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>All-time total in {cat.label}</Text>
          </View>

          {data && data.comparison.previousPaise > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">
                Month over month
              </Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardRow}>
                  <Text style={[styles.cardLabel, { color: colors.text }]}>This month vs last</Text>
                  <View style={styles.trend}>
                    <Ionicons name={trend?.direction === 'down' ? 'trending-down' : 'trending-up'} size={18} color={trendColor} />
                    <Text style={[styles.trendValue, { color: trendColor }]}>{trend?.percent ?? 0}%</Text>
                  </View>
                </View>
                <Text style={[styles.detail, { color: colors.textSecondary }]}>
                  Last month: {format(data.comparison.previousPaise)} • This month: {format(data.comparison.currentPaise)}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">
              Recent {cat.label} transactions
            </Text>
            {data && data.recent.length > 0 ? (
              data.recent.map((t) => <TransactionCard key={t.id} transaction={t} onEdit={(tx) => router.push(routes.editTransaction(tx.id))} />)
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>No transactions in this category yet.</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { marginTop: Spacing.xxl },
  summary: { alignItems: 'center', paddingVertical: Spacing.xl },
  iconLarge: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  total: { fontSize: 44, fontWeight: '800' },
  totalLabel: { fontSize: FontSizes.md, marginTop: Spacing.xs },
  section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xl },
  sectionTitle: { fontSize: FontSizes.md, fontWeight: '600', marginBottom: Spacing.md },
  card: { borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, gap: Spacing.xs },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: FontSizes.md },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendValue: { fontSize: FontSizes.lg, fontWeight: '700' },
  detail: { fontSize: FontSizes.sm },
  empty: { textAlign: 'center', marginTop: Spacing.xl },
});
