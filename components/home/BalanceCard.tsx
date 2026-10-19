import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Money, useFormatMoney } from '@/components/ui/Money';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useSecurity } from '@/contexts/security-context';
import { Paise } from '@/domain/money';
import { BudgetUsage, Period, Trend } from '@/domain/periods';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface BalanceCardProps {
  balancePaise: Paise;
  incomePaise: Paise;
  expensePaise: Paise;
  trend: Trend;
  period: Period;
  onPeriodChange: (period: Period) => void;
  /** Spend against the *monthly* budget. Always about the current month, whatever period is selected. */
  budget?: { budgetPaise: Paise; spentPaise: Paise; usage: BudgetUsage } | null;
}

const PERIODS: readonly Period[] = ['week', 'month', 'year'];
const LABELS: Record<Period, string> = { week: 'This week', month: 'This month', year: 'This year' };

export function BalanceCard({ balancePaise, incomePaise, expensePaise, trend, period, onPeriodChange, budget }: BalanceCardProps) {
  const colors = useThemeColors();
  const { isPrivacyModeEnabled, setPrivacyModeEnabled } = useSecurity();
  const format = useFormatMoney();

  const trendColor = trend.direction === 'up' ? colors.error : trend.direction === 'down' ? colors.success : colors.textSecondary;
  const trendIcon = trend.direction === 'up' ? 'trending-up' : trend.direction === 'down' ? 'trending-down' : 'remove';

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.periodRow, { backgroundColor: colors.surface }]} accessibilityRole="tablist">
        {PERIODS.map((p) => {
          const active = period === p;
          return (
            <TouchableOpacity
              key={p}
              accessibilityRole="tab"
              accessibilityLabel={LABELS[p]}
              accessibilityState={{ selected: active }}
              onPress={() => onPeriodChange(p)}
              style={[styles.periodButton, { backgroundColor: active ? colors.tint : 'transparent' }]}
            >
              <Text style={{ color: active ? colors.onTint : colors.textSecondary, fontWeight: active ? '600' : '400', fontSize: FontSizes.sm }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {budget && (
        <View style={styles.budget} accessible accessibilityLabel={`Monthly budget ${format(budget.budgetPaise)}, ${budget.usage.percent} percent spent`}>
          <View style={styles.budgetHeader}>
            <Text style={[styles.budgetText, { color: colors.textSecondary }]}>
              Monthly budget: <Text style={{ color: colors.text }}>{format(budget.budgetPaise)}</Text>
            </Text>
            <Text style={[styles.budgetText, { color: budget.usage.over ? colors.error : colors.textSecondary }]}>{budget.usage.percent}% spent</Text>
          </View>
          <View style={[styles.barBg, { backgroundColor: colors.surface }]}>
            <View style={[styles.barFill, { width: `${budget.usage.barPercent}%`, backgroundColor: budget.usage.over ? colors.error : colors.tint }]} />
          </View>
        </View>
      )}

      <View style={styles.balanceSection}>
        <View style={styles.labelRow}>
          <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>{LABELS[period]}</Text>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityLabel="Privacy mode"
            accessibilityState={{ checked: isPrivacyModeEnabled }}
            onPress={() => void setPrivacyModeEnabled(!isPrivacyModeEnabled)}
            style={styles.eye}
          >
            <Ionicons name={isPrivacyModeEnabled ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Money paise={balancePaise} style={[styles.balance, { color: colors.text }]} numberOfLines={1} />

        {trend.percent > 0 && (
          <View style={styles.trendRow}>
            <Ionicons name={trendIcon} size={18} color={trendColor} />
            <Text style={[styles.trendText, { color: trendColor }]}>{trend.percent}%</Text>
            <Text style={[styles.trendLabel, { color: colors.textSecondary }]}>spending vs last {period}</Text>
          </View>
        )}

        <View style={[styles.subtotals, { borderTopColor: colors.border }]}>
          <View style={styles.subtotalItem}>
            <View style={[styles.subtotalIcon, { backgroundColor: `${colors.success}33` }]}>
              <Ionicons name="arrow-down-circle" size={16} color={colors.success} />
            </View>
            <View>
              <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>Income</Text>
              <Money paise={incomePaise} style={[styles.subtotalValue, { color: colors.success }]} />
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.subtotalItem}>
            <View style={[styles.subtotalIcon, { backgroundColor: `${colors.error}33` }]}>
              <Ionicons name="arrow-up-circle" size={16} color={colors.error} />
            </View>
            <View>
              <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>Expense</Text>
              <Money paise={expensePaise} style={[styles.subtotalValue, { color: colors.text }]} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.lg },
  periodRow: { flexDirection: 'row', marginBottom: Spacing.md, borderRadius: BorderRadius.md, padding: 4 },
  periodButton: { flex: 1, minHeight: 36, justifyContent: 'center', borderRadius: BorderRadius.sm, alignItems: 'center' },
  budget: { marginBottom: Spacing.lg },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: Spacing.xs },
  budgetText: { fontSize: FontSizes.xs, fontWeight: '600' },
  barBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  balanceSection: { alignItems: 'center', paddingVertical: Spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  periodLabel: { fontSize: FontSizes.sm },
  eye: { padding: 10 },
  balance: { fontSize: 48, fontWeight: '800', marginBottom: Spacing.xs },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendText: { fontSize: FontSizes.lg, fontWeight: '600' },
  trendLabel: { fontSize: FontSizes.sm },
  subtotals: { flexDirection: 'row', marginTop: Spacing.xl, width: '100%', paddingTop: Spacing.lg, borderTopWidth: 1, alignItems: 'center' },
  subtotalItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  subtotalIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  subtotalLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  subtotalValue: { fontSize: FontSizes.md, fontWeight: '700' },
  divider: { width: 1, height: 30, marginHorizontal: Spacing.md },
});
