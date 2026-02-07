import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { calculateInsights, getDailyTrend, Period } from '@/services/analytics';
import { getAllTransactions, getBudget } from '@/services/storage';
import { DEFAULT_CATEGORIES } from '@/services/category-storage';
import { BalanceCard } from '@/components/home/BalanceCard';

const screenWidth = Dimensions.get('window').width;

export default function ChartsScreen() {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const insets = useSafeAreaInsets();

    const [period, setPeriod] = useState<Period>('month');
    const [insights, setInsights] = useState<any>(null);
    const [budget, setBudget] = useState<number | null>(null);
    const [dailyTrend, setDailyTrend] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        try {
            const [insightsData, budgetData] = await Promise.all([
                calculateInsights(period),
                getBudget()
            ]);
            setInsights(insightsData);
            setBudget(budgetData);

            // Get appropriate trend data based on period
            let trendData;
            if (period === 'week') {
                trendData = await getDailyTrend(7);
            } else if (period === 'month') {
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const daysSinceMonthStart = Math.floor((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const dailyData = await getDailyTrend(daysSinceMonthStart);

                trendData = [];
                const weeksCount = Math.ceil(daysSinceMonthStart / 7);

                for (let i = 0; i < weeksCount; i++) {
                    const weekData = dailyData.slice(i * 7, Math.min((i + 1) * 7, dailyData.length));
                    if (weekData.length > 0) {
                        const weekAmount = weekData.reduce((sum, d) => sum + d.amount, 0);
                        trendData.push({
                            day: `W${i + 1}`,
                            amount: weekAmount,
                            date: weekData[0]?.date,
                        });
                    }
                }
            } else {
                const allTxs = await getAllTransactions();
                const now = new Date();
                trendData = [];

                for (let i = 11; i >= 0; i--) {
                    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
                    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);

                    const monthTxs = allTxs.filter(
                        tx => tx.timestamp >= monthStart.getTime() && tx.timestamp <= monthEnd.getTime() && tx.type !== 'income'
                    );
                    const monthAmount = monthTxs.reduce((sum, tx) => sum + tx.amount, 0);
                    const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monthDate);

                    trendData.push({
                        day: monthName,
                        amount: monthAmount,
                        date: monthDate,
                    });
                }
            }

            setDailyTrend(trendData);
        } catch (error) {
            console.error('Error loading charts data:', error);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handlePeriodChange = (newPeriod: Period) => {
        if (newPeriod === period) return;
        setPeriod(newPeriod);
        setLoading(true);
    };

    const maxDailyAmount = Math.max(...dailyTrend.map(d => d.amount), 1);
    const chartTitle = period === 'week' ? 'Daily Spending' : period === 'month' ? 'Weekly Spending' : 'Monthly Spending';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 }
                ]}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.tint}
                        colors={[colors.tint]}
                        progressBackgroundColor={colors.card}
                    />
                }
            >
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.tint} />
                    </View>
                ) : insights ? (
                    <>
                        {/* Balance Card */}
                        <BalanceCard
                            balance={insights.balance}
                            totalIncome={insights.totalIncome}
                            totalExpense={insights.totalExpense}
                            trend={insights.trend}
                            period={period}
                            budget={budget}
                            onPeriodChange={handlePeriodChange}
                        />

                        {/* Category Breakdown */}
                        {insights.categoryBreakdown.length > 0 ? (
                            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <Text style={[styles.cardTitle, { color: colors.text }]}>Category Breakdown</Text>

                                <View style={styles.categoryList}>
                                    {insights.categoryBreakdown.slice(0, 5).map((item: any) => {
                                        const catInfo = DEFAULT_CATEGORIES.find(c => c.key === item.category) || DEFAULT_CATEGORIES[4];
                                        return (
                                            <View key={item.category} style={styles.categoryRow}>
                                                <View style={styles.categoryLeft}>
                                                    <View style={[styles.categoryDot, { backgroundColor: catInfo.color }]} />
                                                    <Text style={[styles.categoryLabel, { color: colors.text }]}>{catInfo.label}</Text>
                                                </View>
                                                <View style={styles.categoryRight}>
                                                    <Text style={[styles.categoryPercent, { color: colors.text }]}>{item.percent}%</Text>
                                                    <Text style={[styles.categoryAmount, { color: colors.textSecondary }]}>₹{item.amount.toLocaleString('en-IN')}</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>

                                {/* Visual Bar */}
                                <View style={styles.pieVisual}>
                                    {insights.categoryBreakdown.slice(0, 5).map((item: any, index: number) => {
                                        const catInfo = DEFAULT_CATEGORIES.find(c => c.key === item.category) || DEFAULT_CATEGORIES[4];
                                        return (
                                            <View
                                                key={item.category}
                                                style={[
                                                    styles.pieSegment,
                                                    {
                                                        flex: item.percent,
                                                        backgroundColor: catInfo.color,
                                                        borderTopLeftRadius: index === 0 ? 8 : 0,
                                                        borderBottomLeftRadius: index === 0 ? 8 : 0,
                                                        borderTopRightRadius: index === insights.categoryBreakdown.slice(0, 5).length - 1 ? 8 : 0,
                                                        borderBottomRightRadius: index === insights.categoryBreakdown.slice(0, 5).length - 1 ? 8 : 0,
                                                    }
                                                ]}
                                            />
                                        );
                                    })}
                                </View>
                            </View>
                        ) : null}

                        {/* Trend Bar Chart */}
                        {dailyTrend.length > 0 && dailyTrend.some(d => d.amount > 0) ? (
                            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <Text style={[styles.cardTitle, { color: colors.text }]}>{chartTitle}</Text>

                                <View style={styles.barChart}>
                                    {dailyTrend.map((day, index) => {
                                        const barHeight = day.amount > 0 ? (day.amount / maxDailyAmount) * 120 : 4;
                                        return (
                                            <View key={index} style={styles.barColumn}>
                                                <View style={styles.barContainer}>
                                                    <View
                                                        style={[
                                                            styles.bar,
                                                            {
                                                                height: barHeight,
                                                                backgroundColor: day.amount > 0 ? colors.tint : colors.surface,
                                                            }
                                                        ]}
                                                    />
                                                </View>
                                                <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{day.day}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        ) : null}
                    </>
                ) : (
                    <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>No data available</Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Start tracking to see analytics</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: Spacing.lg,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 100,
    },
    card: {
        borderWidth: 1,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    cardTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        marginBottom: Spacing.md,
    },
    categoryList: {
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    categoryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    categoryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    categoryDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    categoryLabel: {
        fontSize: FontSizes.md,
        fontWeight: '500',
    },
    categoryRight: {
        alignItems: 'flex-end',
    },
    categoryPercent: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
    },
    categoryAmount: {
        fontSize: FontSizes.sm,
    },
    pieVisual: {
        flexDirection: 'row',
        height: 12,
        width: '100%',
        overflow: 'hidden',
    },
    pieSegment: {
        height: '100%',
    },
    barChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 150,
        paddingTop: 20,
    },
    barColumn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
    },
    barContainer: {
        width: '80%',
        height: 120,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    bar: {
        width: '100%',
        borderRadius: 4,
        minHeight: 4,
    },
    barLabel: {
        fontSize: FontSizes.xs,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        borderRadius: BorderRadius.lg,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
    },
});
