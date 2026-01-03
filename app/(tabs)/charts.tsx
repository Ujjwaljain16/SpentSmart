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
                // Show last 7 days
                trendData = await getDailyTrend(7);
            } else if (period === 'month') {
                // Show current month's weeks (from start of month to today)
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const daysSinceMonthStart = Math.floor((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                // Get daily data for current month
                const dailyData = await getDailyTrend(daysSinceMonthStart);

                // Group into weeks
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
                // Year: Show last 12 months
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
        // Don't reload if clicking same period
        if (newPeriod === period) {
            return;
        }
        setPeriod(newPeriod);
        setLoading(true);
    };

    const backgroundColor = colorScheme === 'dark' ? '#1E3A8A' : '#3B82F6';

    // Calculate max for chart scaling
    const maxDailyAmount = Math.max(...dailyTrend.map(d => d.amount), 1);

    // Chart title based on period
    const chartTitle = period === 'week' ? 'Daily Spending' : period === 'month' ? 'Weekly Spending' : 'Monthly Spending';

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <StatusBar style="light" />

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 }
                ]}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#FFF"
                        colors={['#3B82F6']}
                        progressBackgroundColor="#FFF"
                    />
                }
            >
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#FFF" />
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
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Category Breakdown</Text>

                                {/* Simple Pie Chart Representation */}
                                <View style={styles.categoryList}>
                                    {insights.categoryBreakdown.slice(0, 5).map((item: any) => {
                                        const catInfo = DEFAULT_CATEGORIES.find(c => c.key === item.category) || DEFAULT_CATEGORIES[4];
                                        return (
                                            <View key={item.category} style={styles.categoryRow}>
                                                <View style={styles.categoryLeft}>
                                                    <View style={[styles.categoryDot, { backgroundColor: catInfo.color }]} />
                                                    <Text style={styles.categoryLabel}>{catInfo.label}</Text>
                                                </View>
                                                <View style={styles.categoryRight}>
                                                    <Text style={styles.categoryPercent}>{item.percent}%</Text>
                                                    <Text style={styles.categoryAmount}>₹{item.amount.toLocaleString('en-IN')}</Text>
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
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>{chartTitle}</Text>

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
                                                                backgroundColor: day.amount > 0 ? '#EC4899' : 'rgba(255,255,255,0.1)',
                                                            }
                                                        ]}
                                                    />
                                                </View>
                                                <Text style={styles.barLabel}>{day.day}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        ) : null}
                    </>
                ) : (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>No data available</Text>
                        <Text style={styles.emptySubtitle}>Start tracking to see analytics</Text>
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
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    cardTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        color: '#FFF',
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
        color: '#FFF',
    },
    categoryRight: {
        alignItems: 'flex-end',
    },
    categoryPercent: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.95)',
    },
    categoryAmount: {
        fontSize: FontSizes.sm,
        color: 'rgba(255, 255, 255, 0.7)',
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
        color: 'rgba(255, 255, 255, 0.7)',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#FFF',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },
});
