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
        <View style={[styles.container, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)' }]}>
            {/* Period Selector */}
            <View style={styles.periodRow}>
                {(['week', 'month', 'year'] as Period[]).map((p) => (
                    <TouchableOpacity
                        key={p}
                        onPress={() => onPeriodChange(p)}
                        style={[
                            styles.periodButton,
                            {
                                backgroundColor: period === p ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                                borderColor: period === p ? 'rgba(255, 255, 255, 0.3)' : 'transparent',
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.periodText,
                                {
                                    color: period === p ? '#FFF' : 'rgba(255, 255, 255, 0.6)',
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
                        <Text style={styles.budgetText}>
                            Monthly Budget: <Text style={styles.budgetAmount}>₹{budget.toLocaleString('en-IN')}</Text>
                        </Text>
                        <Text style={[styles.budgetText, { color: totalExpense > budget ? '#EF4444' : 'rgba(255,255,255,0.6)' }]}>
                            {Math.round((totalExpense / budget) * 100)}% spent
                        </Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                        <View
                            style={[
                                styles.progressBarFill,
                                {
                                    width: `${Math.min((totalExpense / budget) * 100, 100)}%`,
                                    backgroundColor: totalExpense > budget ? '#EF4444' : '#3B82F6'
                                }
                            ]}
                        />
                    </View>
                </View>
            )}

            {/* Balance Display */}
            <View style={styles.balanceSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.periodLabel, { color: 'rgba(255, 255, 255, 0.6)' }]}>
                        {periodLabels[period]}
                    </Text>
                    <TouchableOpacity onPress={() => setPrivacyModeEnabled(!isPrivacyModeEnabled)}>
                        <Ionicons
                            name={isPrivacyModeEnabled ? "eye-off" : "eye"}
                            size={14}
                            color="rgba(255, 255, 255, 0.4)"
                        />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.balance, isPrivacyModeEnabled && { fontSize: 48, marginVertical: 12 }]}>
                    {formatAmount(balance)}
                </Text>

                {/* Trend Indicator */}
                {trend.percent > 0 && (
                    <View style={styles.trendRow}>
                        <Ionicons name={trendIcon} size={18} color={trendColor} />
                        <Text style={[styles.trendText, { color: trendColor }]}>
                            {trend.percent}%
                        </Text>
                        <Text style={[styles.trendLabel, { color: 'rgba(255, 255, 255, 0.7)' }]}>
                            vs last {period}
                        </Text>
                    </View>
                )}

                {/* Sub-totals Row */}
                <View style={styles.subtotalsRow}>
                    <View style={styles.subtotalItem}>
                        <View style={[styles.subtotalIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                            <Ionicons name="arrow-down-circle" size={16} color="#10B981" />
                        </View>
                        <View>
                            <Text style={styles.subtotalLabel}>Income</Text>
                            <Text style={[styles.subtotalValue, { color: '#10B981' }]}>{formatAmount(totalIncome)}</Text>
                        </View>
                    </View>
                    <View style={styles.subtotalDivider} />
                    <View style={styles.subtotalItem}>
                        <View style={[styles.subtotalIcon, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                            <Ionicons name="arrow-up-circle" size={16} color="#EF4444" />
                        </View>
                        <View>
                            <Text style={styles.subtotalLabel}>Expense</Text>
                            <Text style={styles.subtotalValue}>{formatAmount(totalExpense)}</Text>
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
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)',
        elevation: 5,
    },
    periodRow: {
        flexDirection: 'row',
        marginBottom: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        padding: 4,
    },
    periodButton: {
        flex: 1,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        borderWidth: 1,
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
        fontSize: 72,
        fontWeight: '900',
        color: '#FFF',
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
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
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
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    subtotalValue: {
        fontSize: FontSizes.md,
        fontWeight: '700',
        color: '#FFF',
    },
    subtotalDivider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
        color: 'rgba(255, 255, 255, 0.6)',
        fontWeight: '600',
    },
    budgetAmount: {
        color: '#FFF',
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
