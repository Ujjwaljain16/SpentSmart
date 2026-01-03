import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTransactionsByCategory, getMonthlyComparison } from '@/services/analytics';
import { Transaction } from '@/types/transaction';
import { TransactionCard } from '@/components/transactions/transaction-card';
import { DEFAULT_CATEGORIES } from '@/services/category-storage';
import { useSecurity } from '@/contexts/security-context';

export default function AnalyticsDetailScreen() {
    const { category } = useLocalSearchParams<{ category: string }>();
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const { isPrivacyModeEnabled } = useSecurity();

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [comparison, setComparison] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const catInfo = DEFAULT_CATEGORIES.find(c => c.key === category) || DEFAULT_CATEGORIES.find(c => c.key === 'other')!;

    const loadData = useCallback(async () => {
        if (!category) return;
        setLoading(true);
        try {
            const [txs, comp] = await Promise.all([
                getTransactionsByCategory(category as any),
                getMonthlyComparison()
            ]);
            setTransactions(txs);
            setComparison(comp);
        } catch (error) {
            console.error('Error loading analytics detail:', error);
        } finally {
            setLoading(false);
        }
    }, [category]);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    const backgroundColor = colorScheme === 'dark' ? '#1E3A8A' : '#3B82F6';

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <StatusBar style="light" />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{catInfo.label} Insights</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}>
                {/* Summary Card */}
                <View style={styles.summaryCard}>
                    <View style={[styles.iconLarge, { backgroundColor: `${catInfo.color}40` }]}>
                        <Ionicons name={catInfo.icon as any} size={32} color={catInfo.color} />
                    </View>
                    <Text style={styles.totalAmount}>
                        {isPrivacyModeEnabled ? '•••••' : `₹${transactions.reduce((sum, tx) => sum + tx.amount, 0).toLocaleString('en-IN')}`}
                    </Text>
                    <Text style={styles.totalLabel}>Total Spent in {catInfo.label}</Text>
                </View>

                {/* Comparison Section */}
                {comparison && comparison[category as string] && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Month-over-Month</Text>
                        <View style={styles.comparisonCard}>
                            <View style={styles.comparisonRow}>
                                <Text style={styles.comparisonLabel}>vs Last Month</Text>
                                <View style={styles.comparisonValueRow}>
                                    <Ionicons
                                        name={comparison[category as string].trend === 'up' ? "trending-up" : "trending-down"}
                                        size={18}
                                        color={comparison[category as string].trend === 'up' ? "#EF4444" : "#10B981"}
                                    />
                                    <Text style={[styles.comparisonValue, { color: comparison[category as string].trend === 'up' ? "#EF4444" : "#10B981" }]}>
                                        {comparison[category as string].percent}%
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.comparisonDetail}>
                                Last month: ₹{comparison[category as string].lastMonth.toLocaleString('en-IN')}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Recent Transactions */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent {catInfo.label} Payments</Text>
                    {transactions.length > 0 ? (
                        transactions.slice(0, 10).map(tx => (
                            <TransactionCard key={tx.id} transaction={tx} showDeleteButton={false} showEditButton={false} />
                        ))
                    ) : (
                        <Text style={styles.emptyText}>No recent transactions in this category</Text>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '700',
        color: '#FFF',
    },
    summaryCard: {
        alignItems: 'center',
        paddingVertical: Spacing.xl,
        marginTop: Spacing.md,
    },
    iconLarge: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    totalAmount: {
        fontSize: 48,
        fontWeight: '800',
        color: '#FFF',
    },
    totalLabel: {
        fontSize: FontSizes.md,
        color: 'rgba(255,255,255,0.6)',
        marginTop: Spacing.xs,
    },
    section: {
        paddingHorizontal: Spacing.lg,
        marginTop: Spacing.xl,
    },
    sectionTitle: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: Spacing.md,
    },
    comparisonCard: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    comparisonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    comparisonLabel: {
        fontSize: FontSizes.md,
        color: '#FFF',
    },
    comparisonValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    comparisonValue: {
        fontSize: FontSizes.lg,
        fontWeight: '700',
    },
    comparisonDetail: {
        fontSize: FontSizes.sm,
        color: 'rgba(255,255,255,0.6)',
    },
    emptyText: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.5)',
        marginTop: Spacing.xl,
    }
});
