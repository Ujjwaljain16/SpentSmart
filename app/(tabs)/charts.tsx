import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceCard } from '@/components/home/BalanceCard';
import { Money, useFormatMoney } from '@/components/ui/Money';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useSettings } from '@/contexts/settings-context';
import { Period, budgetUsage, dayBuckets, monthBuckets, weekBucketsOfMonth } from '@/domain/periods';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';

const TITLES: Record<Period, string> = { week: 'Daily spending', month: 'Weekly spending', year: 'Monthly spending' };
const BAR_AREA = 120;

export default function ChartsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { resolve } = useCategories();
  const format = useFormatMoney();
  const [period, setPeriod] = useState<Period>('month');
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, refresh } = useLiveQuery(
    async (repos) => {
      const now = new Date();
      const buckets = period === 'week' ? dayBuckets(7, now) : period === 'month' ? weekBucketsOfMonth(now) : monthBuckets(12, now);
      const [insights, monthly, trend] = await Promise.all([
        repos.analytics.insights(period, now),
        repos.analytics.insights('month', now),
        repos.analytics.bucketTotals(buckets),
      ]);
      return { insights, monthSpent: monthly.expensePaise, trend };
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
  const maxBucket = data ? Math.max(...data.trend.map((b) => b.amountPaise), 1) : 1;
  const top = insights?.categories.slice(0, 5) ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} colors={[colors.tint]} progressBackgroundColor={colors.card} />}
      >
        {loading && !data ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : insights && data ? (
          <>
            <BalanceCard
              balancePaise={insights.balancePaise}
              incomePaise={insights.incomePaise}
              expensePaise={insights.expensePaise}
              trend={insights.trend}
              period={period}
              onPeriodChange={setPeriod}
              budget={usage ? { budgetPaise: settings.budgetPaise, spentPaise: data.monthSpent, usage } : null}
            />

            {top.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
                  Category breakdown
                </Text>
                {top.map((item) => {
                  const cat = resolve(item.categoryKey);
                  return (
                    <View key={item.categoryKey} style={styles.catRow} accessible accessibilityLabel={`${cat.label}, ${item.percent} percent, ${format(item.amountPaise)}`}>
                      <View style={styles.catLeft}>
                        <View style={[styles.dot, { backgroundColor: cat.color }]} />
                        <Text style={[styles.catLabel, { color: colors.text }]} numberOfLines={1}>
                          {cat.label}
                        </Text>
                      </View>
                      <View style={styles.catRight}>
                        <Text style={[styles.catPercent, { color: colors.text }]}>{item.percent}%</Text>
                        <Money paise={item.amountPaise} style={[styles.catAmount, { color: colors.textSecondary }]} />
                      </View>
                    </View>
                  );
                })}
                <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {top.map((item, i) => (
                    <View
                      key={item.categoryKey}
                      style={{
                        flex: Math.max(item.percent, 1),
                        backgroundColor: resolve(item.categoryKey).color,
                        borderTopLeftRadius: i === 0 ? 8 : 0,
                        borderBottomLeftRadius: i === 0 ? 8 : 0,
                        borderTopRightRadius: i === top.length - 1 ? 8 : 0,
                        borderBottomRightRadius: i === top.length - 1 ? 8 : 0,
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {data.trend.some((b) => b.amountPaise > 0) && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
                  {TITLES[period]}
                </Text>
                <View style={styles.bars}>
                  {data.trend.map((bucket) => (
                    <View key={bucket.start} style={styles.barColumn} accessible accessibilityLabel={`${bucket.label}: ${format(bucket.amountPaise)}`}>
                      <View style={styles.barArea}>
                        <View
                          style={[
                            styles.bar,
                            { height: bucket.amountPaise > 0 ? Math.max((bucket.amountPaise / maxBucket) * BAR_AREA, 4) : 4, backgroundColor: bucket.amountPaise > 0 ? colors.tint : colors.surface },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{bucket.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No data available</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Start tracking to see analytics</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
  card: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg },
  cardTitle: { fontSize: FontSizes.lg, fontWeight: '600', marginBottom: Spacing.md },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  catLabel: { fontSize: FontSizes.md, fontWeight: '500', flexShrink: 1 },
  catRight: { alignItems: 'flex-end' },
  catPercent: { fontSize: FontSizes.lg, fontWeight: '600' },
  catAmount: { fontSize: FontSizes.sm },
  stack: { flexDirection: 'row', height: 12, width: '100%', overflow: 'hidden', marginTop: Spacing.md },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 150, paddingTop: 20 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  barArea: { width: '80%', height: BAR_AREA, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: FontSizes.xs },
  empty: { alignItems: 'center', paddingVertical: 60, borderRadius: BorderRadius.lg },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '600', marginBottom: 8 },
  emptySub: { fontSize: FontSizes.sm },
});
