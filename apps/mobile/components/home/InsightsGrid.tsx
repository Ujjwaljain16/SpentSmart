import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Money } from '@/components/ui/Money';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { CategoryShare, PayeeTotal } from '@/db/repositories/analytics';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';

interface InsightsGridProps {
  categories: readonly CategoryShare[];
  topPayees: readonly PayeeTotal[];
}

const PAYEE_DOT_COLORS = ['#EC4899', '#8B5CF6', '#14B8A6'] as const;

export function InsightsGrid({ categories, topPayees }: InsightsGridProps) {
  const colors = useThemeColors();
  const { resolve } = useCategories();
  const top = categories.slice(0, 3);

  return (
    <View style={styles.grid}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.header}>
          <Ionicons name="pie-chart" size={18} color={colors.tint} />
          <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
            Spending
          </Text>
        </View>

        {top.length > 0 ? (
          <View style={styles.list}>
            {top.map((item) => {
              const cat = resolve(item.categoryKey);
              return (
                <TouchableOpacity
                  key={item.categoryKey}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat.label}, ${item.percent} percent. Open details`}
                  style={styles.row}
                  onPress={() => router.push(routes.analyticsDetail(item.categoryKey))}
                >
                  <View style={styles.left}>
                    <View style={[styles.dot, { backgroundColor: cat.color }]} />
                    <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                      {cat.label}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={[styles.percent, { color: colors.text }]}>{item.percent}%</Text>
                    <Money paise={item.amountPaise} style={[styles.amount, { color: colors.textSecondary }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No spending data</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.header}>
          <Ionicons name="people" size={18} color={colors.tint} />
          <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
            Top payees
          </Text>
        </View>

        {topPayees.length > 0 ? (
          <View style={styles.list}>
            {topPayees.map((payee, index) => (
              <View key={`${payee.name}-${index}`} style={styles.row}>
                <View style={styles.left}>
                  <View style={[styles.smallDot, { backgroundColor: PAYEE_DOT_COLORS[index] ?? colors.tint }]} />
                  <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                    {payee.name}
                  </Text>
                </View>
                <Money paise={payee.amountPaise} style={[styles.payeeAmount, { color: colors.text }]} />
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No payees yet</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  card: { flex: 1, borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: 8 },
  cardTitle: { fontSize: FontSizes.md, fontWeight: '600' },
  list: { gap: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  smallDot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: FontSizes.sm, fontWeight: '500', flexShrink: 1 },
  right: { alignItems: 'flex-end' },
  percent: { fontSize: FontSizes.md, fontWeight: '600' },
  amount: { fontSize: FontSizes.xs },
  payeeAmount: { fontSize: FontSizes.sm, fontWeight: '600' },
  empty: { fontSize: FontSizes.sm, textAlign: 'center', paddingVertical: Spacing.lg },
});
