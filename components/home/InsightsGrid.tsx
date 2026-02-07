import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, BorderRadius, Spacing, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CategoryType } from '@/types/transaction';
import { DEFAULT_CATEGORIES } from '@/services/category-storage';

interface InsightsGridProps {
    categoryBreakdown: {
        category: CategoryType;
        amount: number;
        percent: number;
        count: number;
    }[];
    topPayees: {
        name: string;
        amount: number;
        count: number;
    }[];
}

export function InsightsGrid({ categoryBreakdown, topPayees }: InsightsGridProps) {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];

    // Show top 3 categories
    const topCategories = categoryBreakdown.slice(0, 3);

    return (
        <View style={styles.grid}>
            {/* Left: Category Breakdown */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.header}>
                    <Ionicons name="pie-chart" size={18} color={colors.tint} />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Spending</Text>
                </View>

                {topCategories.length > 0 ? (
                    <View style={styles.categoryList}>
                        {topCategories.map((item) => {
                            const catInfo = DEFAULT_CATEGORIES.find(c => c.key === item.category) || DEFAULT_CATEGORIES[4];
                            return (
                                <TouchableOpacity
                                    key={item.category}
                                    style={styles.categoryRow}
                                    onPress={() => router.push({
                                        pathname: '/analytics-detail',
                                        params: { category: item.category }
                                    })}
                                >
                                    <View style={styles.categoryLeft}>
                                        <View style={[styles.categoryDot, { backgroundColor: catInfo.color }]} />
                                        <Text style={[styles.categoryLabel, { color: colors.text }]}>
                                            {catInfo.label}
                                        </Text>
                                    </View>
                                    <View style={styles.categoryRight}>
                                        <Text style={[styles.categoryPercent, { color: colors.text }]}>
                                            {item.percent}%
                                        </Text>
                                        <Text style={[styles.categoryAmount, { color: colors.textSecondary }]}>
                                            ₹{item.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        No spending data
                    </Text>
                )}
            </View>

            {/* Right: Top Payees */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.header}>
                    <Ionicons name="people" size={18} color={colors.tint} />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Top Payees</Text>
                </View>

                {topPayees.length > 0 ? (
                    <View style={styles.payeeList}>
                        {topPayees.map((payee, index) => (
                            <View key={`${payee.name}-${index}`} style={styles.payeeRow}>
                                <View style={styles.payeeLeft}>
                                    <View style={[styles.payeeDot, {
                                        backgroundColor: index === 0 ? '#EC4899' : index === 1 ? '#8B5CF6' : '#14B8A6'
                                    }]} />
                                    <Text style={[styles.payeeName, { color: colors.text }]} numberOfLines={1}>
                                        {payee.name}
                                    </Text>
                                </View>
                                <Text style={[styles.payeeAmount, { color: colors.text }]}>
                                    ₹{payee.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                        ))}
                    </View>
                ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        No payees yet
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    grid: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginBottom: Spacing.xl,
    },
    card: {
        flex: 1,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        padding: Spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        gap: 8,
    },
    cardTitle: {
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    categoryList: {
        gap: Spacing.sm,
    },
    categoryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    categoryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    categoryDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    categoryLabel: {
        fontSize: FontSizes.sm,
        fontWeight: '500',
    },
    categoryRight: {
        alignItems: 'flex-end',
    },
    categoryPercent: {
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    categoryAmount: {
        fontSize: FontSizes.xs,
    },
    payeeList: {
        gap: Spacing.sm,
    },
    payeeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    payeeLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    payeeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    payeeName: {
        fontSize: FontSizes.sm,
        fontWeight: '500',
        flex: 1,
    },
    payeeAmount: {
        fontSize: FontSizes.sm,
        fontWeight: '600',
    },
    emptyText: {
        fontSize: FontSizes.sm,
        textAlign: 'center',
        paddingVertical: Spacing.lg,
    },
});
