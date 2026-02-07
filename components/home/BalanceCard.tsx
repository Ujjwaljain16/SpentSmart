import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Period } from '@/services/analytics';
import { useSecurity } from '@/contexts/security-context';

interface BalanceCardProps {
    balance: number;
    totalIncome: number;
    totalExpense: number;
    trend: {
        percent: number;
        direction: 'up' | 'down' | 'neutral';
    };
    period: Period;
    budget: number | null;
    onPeriodChange: (period: Period) => void;
}

export function BalanceCard({ balance, totalIncome, totalExpense, trend, period, budget, onPeriodChange }: BalanceCardProps) {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const { isPrivacyModeEnabled, setPrivacyModeEnabled } = useSecurity();

    const formatAmount = (amt: number) => {
        if (isPrivacyModeEnabled) return '••••••';
        return `₹${(amt || 0).toLocaleString('en-IN')}`;
    };

    const periodLabels: Record<Period, string> = {
        week: 'This Week',
        month: 'This Month',
        year: 'This Year',
    };

    const trendColor = trend.direction === 'up' ? colors.error : trend.direction === 'down' ? colors.success : colors.textSecondary;
    const trendIcon = trend.direction === 'up' ? 'trending-up' : trend.direction === 'down' ? 'trending-down' : 'remove';

    return (
        <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Period Selector */}
            <View style={[styles.periodRow, { backgroundColor: colors.surface }]}>
                {(['week', 'month', 'year'] as Period[]).map((p) => (
                    <TouchableOpacity
                        key={p}
                        onPress={() => onPeriodChange(p)}
                        style={[
                            styles.periodButton,
                            {
                                backgroundColor: period === p ? colors.tint : 'transparent',
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.periodText,
                                {
                                    color: period === p ? '#FFF' : colors.textSecondary,
                                    fontWeight: period === p ? '600' : '400',
                                },
                            ]}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Budget Progress */}
            {budget !== null && (
                <View style={styles.budgetContainer}>
                    <View style={styles.budgetHeader}>
                        <Text style={[styles.budgetText, { color: colors.textSecondary }]}>
                            Monthly Budget: <Text style={[styles.budgetAmount, { color: colors.text }]}>₹{budget.toLocaleString('en-IN')}</Text>
                        </Text>
                        <Text style={[styles.budgetText, { color: totalExpense > budget ? colors.error : colors.textSecondary }]}>
                            {Math.round((totalExpense / budget) * 100)}% spent
                        </Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.surface }]}>
                        <View
                            style={[
                                styles.progressBarFill,
                                {
                                    width: `${Math.min((totalExpense / budget) * 100, 100)}%`,
                                    backgroundColor: totalExpense > budget ? colors.error : colors.tint
                                }
                            ]}
                        />
                    </View>
                </View>
            )}

            {/* Balance Display */}
            <View style={styles.balanceSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>
                        {periodLabels[period]}
                    </Text>
                    <TouchableOpacity onPress={() => setPrivacyModeEnabled(!isPrivacyModeEnabled)}>
                        <Ionicons
                            name={isPrivacyModeEnabled ? "eye-off" : "eye"}
                            size={14}
                            color={colors.textSecondary}
                        />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.balance, { color: colors.text }, isPrivacyModeEnabled && { fontSize: 48, marginVertical: 12 }]}>
                    {formatAmount(balance)}
                </Text>

                {/* Trend Indicator */}
                {trend.percent > 0 && (
                    <View style={styles.trendRow}>
                        <Ionicons name={trendIcon} size={18} color={trendColor} />
                        <Text style={[styles.trendText, { color: trendColor }]}>
                            {trend.percent}%
                        </Text>
                        <Text style={[styles.trendLabel, { color: colors.textSecondary }]}>
                            vs last {period}
                        </Text>
                    </View>
                )}

                {/* Sub-totals Row */}
                <View style={[styles.subtotalsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.subtotalItem}>
                        <View style={[styles.subtotalIcon, { backgroundColor: `${colors.success}20` }]}>
                            <Ionicons name="arrow-down-circle" size={16} color={colors.success} />
                        </View>
                        <View>
                            <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>Income</Text>
                            <Text style={[styles.subtotalValue, { color: colors.success }]}>{formatAmount(totalIncome)}</Text>
                        </View>
                    </View>
                    <View style={[styles.subtotalDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.subtotalItem}>
                        <View style={[styles.subtotalIcon, { backgroundColor: `${colors.error}20` }]}>
                            <Ionicons name="arrow-up-circle" size={16} color={colors.error} />
                        </View>
                        <View>
                            <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>Expense</Text>
                            <Text style={[styles.subtotalValue, { color: colors.text }]}>{formatAmount(totalExpense)}</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    periodRow: {
        flexDirection: 'row',
        marginBottom: Spacing.md,
        borderRadius: BorderRadius.md,
        padding: 4,
    },
    periodButton: {
        flex: 1,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
    },
    periodText: {
        fontSize: FontSizes.sm,
    },
    balanceSection: {
        alignItems: 'center',
        paddingVertical: Spacing.md,
    },
    periodLabel: {
        fontSize: FontSizes.sm,
        marginBottom: 4,
    },
    balance: {
        fontSize: 56,
        fontWeight: '800',
        marginBottom: Spacing.xs,
    },
    trendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    trendText: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
    },
    trendLabel: {
        fontSize: FontSizes.sm,
    },
    subtotalsRow: {
        flexDirection: 'row',
        marginTop: Spacing.xl,
        width: '100%',
        paddingTop: Spacing.lg,
        borderTopWidth: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    subtotalItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    subtotalIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subtotalLabel: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    subtotalValue: {
        fontSize: FontSizes.md,
        fontWeight: '700',
    },
    subtotalDivider: {
        width: 1,
        height: 30,
        marginHorizontal: Spacing.md,
    },
    budgetContainer: {
        marginBottom: Spacing.lg,
    },
    budgetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: Spacing.xs,
    },
    budgetText: {
        fontSize: 10,
        fontWeight: '600',
    },
    budgetAmount: {
    },
    progressBarBg: {
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
});
