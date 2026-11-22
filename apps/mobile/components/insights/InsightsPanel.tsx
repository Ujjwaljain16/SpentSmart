import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Money, useFormatMoney } from '@/components/ui/Money';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useSecurity } from '@/contexts/security-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Evidence } from '@spentsmart/finance/insights/common';
import { Cadence } from '@spentsmart/finance/insights/recurring';
import { Insights } from '@spentsmart/finance/insights/run';

const CADENCE_LABEL: Record<Cadence, string> = { weekly: 'weekly', monthly: 'monthly', quarterly: 'every 3 months', yearly: 'yearly' };

/** "Why?" toggle: the rule and the rows behind a claim. Amounts stay hidden in privacy mode. */
function Why({ evidence, label }: { evidence: Evidence; label: string }) {
  const colors = useThemeColors();
  const { isPrivacyModeEnabled } = useSecurity();
  const [open, setOpen] = useState(false);
  const count = evidence.transactionIds.length;
  return (
    <View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Why: ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.whyButton}
      >
        <Ionicons name={open ? 'chevron-up' : 'help-circle-outline'} size={16} color={colors.tint} />
        <Text style={[styles.whyLabel, { color: colors.tint }]}>{open ? 'Hide' : 'Why?'}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={[styles.whyBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.whyText, { color: colors.text }]}>
            {isPrivacyModeEnabled ? 'Turn off privacy mode to see the numbers behind this.' : evidence.formula}
          </Text>
          <Text style={[styles.whyMeta, { color: colors.textSecondary }]}>
            Based on {count} transaction{count === 1 ? '' : 's'}
            {evidence.period ? `, ${format(evidence.period.start, 'd MMM yyyy')} – ${format(evidence.period.end - 1, 'd MMM yyyy')}` : ''}. Worked out on
            this phone.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Card({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={20} color={colors.tint} />
        <Text style={[styles.cardTitle, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function InsightsPanel({ insights }: { insights: Insights }) {
  const colors = useThemeColors();
  const money = useFormatMoney();
  const { resolve } = useCategories();
  const { forecast } = insights;
  const bills = insights.recurring.filter((r) => r.active);
  const movers = insights.categories.filter((c) => c.unusual || (c.changePercent !== null && Math.abs(c.changePercent) >= 25 && Math.abs(c.changePaise) >= 500_00)).slice(0, 4);

  return (
    <View>
      {forecast.spentPaise > 0 || forecast.upcomingPaise > 0 ? (
        <Card title="Month-end estimate" icon="trending-up-outline">
          <Money paise={forecast.likelyPaise} style={[styles.big, { color: colors.text }]} />
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Likely between {money(forecast.lowPaise)} and {money(forecast.highPaise)}. {money(forecast.spentPaise)} spent so far,{' '}
            {forecast.daysLeft} day{forecast.daysLeft === 1 ? '' : 's'} to go.
          </Text>
          {forecast.upcomingBills.length > 0 ? (
            <View style={styles.list}>
              <Text style={[styles.listTitle, { color: colors.textSecondary }]}>Still to come</Text>
              {forecast.upcomingBills.map((b) => (
                <View key={`${b.payeeName}-${b.expectedAt}`} style={styles.listRow}>
                  <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
                    {b.payeeName}
                  </Text>
                  <Text style={[styles.listMeta, { color: colors.textSecondary }]}>around {format(b.expectedAt, 'd MMM')}</Text>
                  <Money paise={b.amountPaise} style={[styles.listAmount, { color: colors.text }]} />
                </View>
              ))}
            </View>
          ) : null}
          <Why evidence={forecast.evidence} label="month-end estimate" />
        </Card>
      ) : null}

      {bills.length > 0 ? (
        <Card title="Bills & subscriptions" icon="repeat-outline">
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            About <Text style={{ color: colors.text, fontWeight: '700' }}>{money(insights.recurringMonthlyPaise)}</Text> a month across {bills.length}{' '}
            regular payment{bills.length === 1 ? '' : 's'}.
          </Text>
          {bills.map((r) => (
            <View key={r.key} style={[styles.item, { borderTopColor: colors.border }]}>
              <View style={styles.listRow}>
                <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
                  {r.payeeName}
                </Text>
                <Money paise={r.typicalAmountPaise} style={[styles.listAmount, { color: colors.text }]} />
              </View>
              <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                {CADENCE_LABEL[r.cadence]} · next around {format(r.nextExpectedAt, 'd MMM')} · {r.confidence >= 0.8 ? 'very regular' : r.confidence >= 0.6 ? 'regular' : 'likely regular'}
              </Text>
              <Why evidence={r.evidence} label={`${r.payeeName} looks recurring`} />
            </View>
          ))}
        </Card>
      ) : null}

      {insights.unusual.length > 0 ? (
        <Card title="Unusual payments" icon="alert-circle-outline">
          {insights.unusual.slice(0, 5).map((u) => (
            <View key={u.transactionId} style={[styles.item, { borderTopColor: colors.border }]}>
              <View style={styles.listRow}>
                <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
                  {u.payeeName}
                </Text>
                <Money paise={u.amountPaise} style={[styles.listAmount, { color: colors.warning }]} />
              </View>
              <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                {u.ratio}× what you usually pay here ({money(u.typicalPaise)})
              </Text>
              <Why evidence={u.evidence} label={`${u.payeeName} payment is unusual`} />
            </View>
          ))}
        </Card>
      ) : null}

      {movers.length > 0 ? (
        <Card title="Compared with earlier months" icon="swap-vertical-outline">
          {movers.map((c) => {
            const up = c.changePaise > 0;
            return (
              <View key={c.categoryKey} style={[styles.item, { borderTopColor: colors.border }]}>
                <View style={styles.listRow}>
                  <Text style={[styles.listName, { color: colors.text }]} numberOfLines={1}>
                    {resolve(c.categoryKey).label}
                  </Text>
                  <Text style={[styles.listAmount, { color: up ? (c.unusual ? colors.error : colors.warning) : colors.success }]}>
                    {up ? '▲' : '▼'} {Math.abs(c.changePercent ?? 0)}%
                  </Text>
                </View>
                <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                  {money(c.currentPaise)} so far vs {money(c.baselinePaise)} by this point usually
                </Text>
                <Why evidence={c.evidence} label={`${resolve(c.categoryKey).label} comparison`} />
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { fontSize: FontSizes.lg, fontWeight: '600' },
  big: { fontSize: FontSizes.xxxl, fontWeight: '800' },
  sub: { fontSize: FontSizes.sm, lineHeight: 20 },
  list: { gap: 6, marginTop: Spacing.xs },
  listTitle: { fontSize: FontSizes.xs, fontWeight: '700', textTransform: 'uppercase' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  listName: { flex: 1, fontSize: FontSizes.md, fontWeight: '600' },
  listMeta: { fontSize: FontSizes.xs },
  listAmount: { fontSize: FontSizes.md, fontWeight: '700' },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm, gap: 2 },
  whyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, alignSelf: 'flex-start' },
  whyLabel: { fontSize: FontSizes.sm, fontWeight: '700' },
  whyBox: { borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.xs },
  whyText: { fontSize: FontSizes.sm, lineHeight: 20 },
  whyMeta: { fontSize: FontSizes.xs },
});
