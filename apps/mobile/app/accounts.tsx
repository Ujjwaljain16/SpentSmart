import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ACCOUNT_TYPE_META } from '@/components/accounts/account-meta';
import { Button } from '@/components/ui/Button';
import { Money, useFormatMoney } from '@/components/ui/Money';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';

export default function AccountsScreen() {
  const colors = useThemeColors();
  const money = useFormatMoney();
  const { data: accounts } = useLiveQuery((r) => r.accounts.list());
  const hasBalances = accounts?.some((a) => a.openingBalancePaise !== 0) ?? false;
  const total = accounts?.filter((a) => a.type !== 'credit').reduce((s, a) => s + a.balancePaise, 0) ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader
        title="Accounts"
        trailing={
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add account" style={styles.headerButton} onPress={() => router.push(routes.newAccount)}>
            <Ionicons name="add" size={26} color={colors.tint} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.total, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Tracked balance (excluding credit cards)</Text>
          <Money paise={total} style={[styles.totalValue, { color: colors.text }]} />
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {hasBalances
              ? 'Your starting balance plus everything recorded in SpentSmart. It won’t match your bank if you skip entries.'
              : 'Tap an account and enter its current balance to start tracking it.'}
          </Text>
        </View>

        {accounts?.map((a) => (
          <TouchableOpacity
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`${a.name}, ${ACCOUNT_TYPE_META[a.type].label}, ${money(a.balancePaise)}. Edit`}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(routes.editAccount(a.id))}
          >
            <View style={[styles.icon, { backgroundColor: colors.surface }]}>
              <Ionicons name={ACCOUNT_TYPE_META[a.type].icon} size={22} color={colors.text} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={[styles.type, { color: colors.textSecondary }]}>{ACCOUNT_TYPE_META[a.type].label}</Text>
            </View>
            <Money paise={a.balancePaise} style={[styles.balance, { color: a.balancePaise < 0 ? colors.error : colors.text }]} />
          </TouchableOpacity>
        ))}

        <Button label="Move money between accounts" variant="secondary" onPress={() => router.push(routes.transfer)} disabled={(accounts?.length ?? 0) < 2} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  headerButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  total: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, gap: Spacing.xs },
  totalLabel: { fontSize: FontSizes.sm },
  totalValue: { fontSize: FontSizes.xxxl, fontWeight: '800' },
  note: { fontSize: FontSizes.xs, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, minHeight: 64 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: FontSizes.md, fontWeight: '700' },
  type: { fontSize: FontSizes.xs },
  balance: { fontSize: FontSizes.md, fontWeight: '700' },
});
