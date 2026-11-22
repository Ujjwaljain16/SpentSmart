import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFormatMoney } from '@/components/ui/Money';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { SafeToSpend } from '@spentsmart/finance/safe-to-spend';

interface SafeToSpendCardProps {
  result: SafeToSpend;
  /** Sum of tracked balances, or null when no opening balance has been set. */
  balancePaise: number | null;
  onPressAccounts: () => void;
  onPressBudgets: () => void;
}

export function SafeToSpendCard({ result, balancePaise, onPressAccounts, onPressBudgets }: SafeToSpendCardProps) {
  const colors = useThemeColors();
  const money = useFormatMoney();
  const until = format(result.periodEnd, 'd MMM');

  const explanation =
    result.limitedBy === 'none'
      ? 'Set a monthly budget or your account balances to see what you can safely spend.'
      : result.limitedBy === 'budget'
        ? `${money(result.safePaise)} left in your budget until ${until} (${result.daysLeft} day${result.daysLeft === 1 ? '' : 's'}).`
        : `${money(result.safePaise)} in your accounts until ${until} (${result.daysLeft} day${result.daysLeft === 1 ? '' : 's'}).`;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Safe to spend today</Text>
      {result.limitedBy === 'none' ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Set up a budget" onPress={onPressBudgets} style={styles.setup}>
          <Ionicons name="add-circle-outline" size={22} color={colors.tint} />
          <Text style={[styles.setupText, { color: colors.tint }]}>Set up a budget</Text>
        </TouchableOpacity>
      ) : (
        <Text
          accessibilityLabel={`Safe to spend today: ${money(result.perDayPaise)}`}
          style={[styles.amount, { color: result.perDayPaise === 0 ? colors.error : colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {money(result.perDayPaise)}
        </Text>
      )}
      <Text style={[styles.explain, { color: colors.textSecondary }]}>{explanation}</Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={balancePaise === null ? 'Set account balances' : `Tracked balance ${money(balancePaise)}. Open accounts`}
        onPress={onPressAccounts}
        style={[styles.balanceRow, { borderTopColor: colors.border }]}
      >
        <Ionicons name="wallet-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Tracked balance</Text>
        <Text style={[styles.balanceValue, { color: colors.text }]} numberOfLines={1}>
          {balancePaise === null ? 'Set balances' : money(balancePaise)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.xs },
  label: { fontSize: FontSizes.sm, fontWeight: '600' },
  amount: { fontSize: FontSizes.display, fontWeight: '800' },
  setup: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 48 },
  setupText: { fontSize: FontSizes.lg, fontWeight: '700' },
  explain: { fontSize: FontSizes.sm, lineHeight: 20 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, minHeight: 48 },
  balanceLabel: { flex: 1, fontSize: FontSizes.sm },
  balanceValue: { fontSize: FontSizes.md, fontWeight: '700', flexShrink: 1 },
});
