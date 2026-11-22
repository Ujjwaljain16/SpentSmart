import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFormatMoney } from '@/components/ui/Money';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { BudgetWithStatus } from '@/db/repositories/budgets';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { routes } from '@/lib/routes';
import { goalMonthlyNeed } from '@spentsmart/finance/safe-to-spend';

export default function BudgetsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const money = useFormatMoney();
  const { resolve } = useCategories();

  const { data, loading } = useLiveQuery(async (repos) => {
    const [budgets, goals] = await Promise.all([repos.budgets.statuses(new Date()), repos.goals.list()]);
    return { budgets, goals };
  });

  const overall = data?.budgets.find((b) => b.categoryKey === null) ?? null;
  const byCategory = data?.budgets.filter((b) => b.categoryKey !== null) ?? [];
  const goals = data?.goals.filter((g) => !g.archived) ?? [];

  const BudgetCard = ({ b, title }: { b: BudgetWithStatus; title: string }) => {
    const s = b.status;
    const markerPercent = s.availablePaise > 0 ? Math.round((s.projectedPaise / s.availablePaise) * 100) : undefined;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${money(s.spentPaise)} of ${money(s.availablePaise)} spent. Edit budget`}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push(routes.editBudget(b.categoryKey))}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.cardFigure, { color: s.over ? colors.error : colors.text }]} numberOfLines={1}>
            {s.over ? `${money(-s.remainingPaise)} over` : `${money(s.remainingPaise)} left`}
          </Text>
        </View>
        <ProgressBar percent={s.percent} markerPercent={markerPercent} />
        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
          {money(s.spentPaise)} of {money(s.availablePaise)}
          {s.carriedPaise > 0 ? ` (incl. ${money(s.carriedPaise)} carried over)` : ''}
        </Text>
        <Text style={[styles.cardSub, { color: s.onTrack ? colors.success : colors.warning }]}>
          {s.onTrack ? 'On track' : `At this pace about ${money(s.projectedPaise)} by month end`}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 120 }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Budgets
        </Text>

        {loading && !data ? (
          <ActivityIndicator style={styles.loading} color={colors.tint} />
        ) : (
          <>
            {overall ? (
              <BudgetCard b={overall} title="This month" />
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.card, styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(routes.editBudget(null))}
              >
                <Ionicons name="add-circle-outline" size={28} color={colors.tint} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Set a monthly budget</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>It powers “safe to spend” on the home screen.</Text>
              </TouchableOpacity>
            )}

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Categories</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a category budget" style={styles.addButton} onPress={() => router.push(routes.editBudget())}>
                <Ionicons name="add" size={22} color={colors.tint} />
                <Text style={[styles.addText, { color: colors.tint }]}>Add</Text>
              </TouchableOpacity>
            </View>
            {byCategory.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>Give a category its own limit, like ₹4,000 for food.</Text>
            ) : (
              byCategory.map((b) => <BudgetCard key={b.id} b={b} title={resolve(b.categoryKey!).label} />)
            )}

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Goals</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a savings goal" style={styles.addButton} onPress={() => router.push(routes.newGoal)}>
                <Ionicons name="add" size={22} color={colors.tint} />
                <Text style={[styles.addText, { color: colors.tint }]}>Add</Text>
              </TouchableOpacity>
            </View>
            {goals.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>Saving for something? Add a goal and track it here.</Text>
            ) : (
              goals.map((g) => {
                const percent = g.targetPaise > 0 ? Math.round((g.savedPaise / g.targetPaise) * 100) : 0;
                const need = goalMonthlyNeed(g, new Date());
                return (
                  <TouchableOpacity
                    key={g.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.name}: ${money(g.savedPaise)} of ${money(g.targetPaise)} saved. Open goal`}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push(routes.editGoal(g.id))}
                  >
                    <View style={styles.cardTop}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={[styles.cardFigure, { color: colors.text }]}>{percent}%</Text>
                    </View>
                    <ProgressBar percent={percent} color={colors.success} />
                    <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                      {money(g.savedPaise)} of {money(g.targetPaise)}
                      {g.deadline ? ` · by ${format(g.deadline, 'd MMM yyyy')}` : ''}
                    </Text>
                    {need !== null && need > 0 ? (
                      <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Put aside {money(need)} a month to make it</Text>
                    ) : need === 0 ? (
                      <Text style={[styles.cardSub, { color: colors.success }]}>Reached</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  title: { fontSize: FontSizes.xxl, fontWeight: 'bold', marginBottom: Spacing.sm },
  loading: { marginTop: 80 },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  emptyCard: { alignItems: 'center', paddingVertical: Spacing.lg },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: FontSizes.md, fontWeight: '700' },
  cardFigure: { fontSize: FontSizes.md, fontWeight: '700' },
  cardSub: { fontSize: FontSizes.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md },
  sectionTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingHorizontal: Spacing.sm },
  addText: { fontSize: FontSizes.md, fontWeight: '700' },
  hint: { fontSize: FontSizes.sm, lineHeight: 20 },
});
