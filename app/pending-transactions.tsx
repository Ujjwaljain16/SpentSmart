import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Alert,
    RefreshControl,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { format } from 'date-fns';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { Transaction } from '@/types/transaction';
import {
    getPendingTransactions,
    removePendingTransaction,
    updateUserPatterns,
} from '@/services/payment-verification';
import { updateTransactionStatus } from '@/services/storage';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function PendingTransactionsScreen() {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const insets = useSafeAreaInsets();

    const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadPending = useCallback(async () => {
        const pending = await getPendingTransactions();
        setPendingTxs(pending);
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadPending();
        }, [loadPending])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPending();
        setRefreshing(false);
    };

    const handleConfirm = async (tx: Transaction) => {
        const timeInApp = tx.returnedAt && tx.launchedAt
            ? (tx.returnedAt - tx.launchedAt) / 1000
            : 15;

        await updateTransactionStatus(tx.id, 'confirmed', 'user', 100);
        await updateUserPatterns(true, timeInApp);
        await removePendingTransaction(tx.id);
        await loadPending();
    };

    const handleFail = async (tx: Transaction) => {
        const timeInApp = tx.returnedAt && tx.launchedAt
            ? (tx.returnedAt - tx.launchedAt) / 1000
            : 5;

        await updateTransactionStatus(tx.id, 'failed', 'user', 0);
        await updateUserPatterns(false, timeInApp);
        await removePendingTransaction(tx.id);
        await loadPending();
    };

    const handleConfirmAll = () => {
        Alert.alert(
            'Confirm All Payments',
            `Mark all ${pendingTxs.length} pending transactions as confirmed?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm All',
                    onPress: async () => {
                        for (const tx of pendingTxs) {
                            await handleConfirm(tx);
                        }
                    },
                },
            ]
        );
    };

    const renderTransaction = ({ item }: { item: Transaction }) => (
        <View style={[styles.card, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}>
            <View style={styles.cardHeader}>
                <View style={styles.cardInfo}>
                    <Text style={[styles.amount, { color: '#FFF' }]}>
                        ₹{item.amount.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.category, { color: 'rgba(255, 255, 255, 0.6)' }]}>
                        {item.category}
                    </Text>
                </View>
            </View>

            <Text style={[styles.payee, { color: '#FFF' }]}>
                {item.payeeName}
            </Text>

            {
                item.reason && (
                    <Text style={[styles.reason, { color: 'rgba(255, 255, 255, 0.6)' }]}>
                        {item.reason}
                    </Text>
                )
            }

            <Text style={[styles.time, { color: 'rgba(255, 255, 255, 0.5)' }]}>
                {format(new Date(item.timestamp), 'MMM d, h:mm a')}
            </Text>

            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.button, styles.confirmButton, { backgroundColor: '#3B82F6' }]}
                    onPress={() => handleConfirm(item)}
                >
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Confirmed</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, styles.failButton, { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' }]}
                    onPress={() => handleFail(item)}
                >
                    <Ionicons name="close-circle" size={20} color="#FFFFFF" />
                    <Text style={[styles.buttonText, { color: '#FFF' }]}>Failed</Text>
                </TouchableOpacity>
            </View>
        </View >
    );

    const renderEmpty = () => (
        <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
                All Caught Up!
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No pending payments to verify
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            {/* Header */}
            <View style={[
                styles.header,
                {
                    paddingTop: insets.top + Spacing.sm,
                    backgroundColor: colors.surface,
                    borderBottomColor: colors.border,
                }
            ]}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.backButton}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>

                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    Pending Payments
                </Text>

                <View style={styles.headerRight}>
                    {pendingTxs.length > 0 && (
                        <View style={[styles.badge, { backgroundColor: colors.tint }]}>
                            <Text style={styles.badgeText}>{pendingTxs.length}</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* List */}
            <FlatList
                data={pendingTxs}
                renderItem={renderTransaction}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={renderEmpty}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.tint}
                    />
                }
            />

            {/* Bulk Actions */}
            {pendingTxs.length > 0 && (
                <View style={[
                    styles.footer,
                    {
                        paddingBottom: insets.bottom + Spacing.md,
                        backgroundColor: colors.surface,
                        borderTopColor: colors.border,
                    }
                ]}>
                    <TouchableOpacity
                        style={[styles.bulkButton, { backgroundColor: colors.tint }]}
                        onPress={handleConfirmAll}
                    >
                        <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
                        <Text style={styles.bulkButtonText}>
                            Confirm All as Paid
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
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
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: Spacing.xs,
        width: 40,
    },
    headerTitle: {
        fontSize: FontSizes.xl,
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    headerRight: {
        width: 40,
        alignItems: 'flex-end',
    },
    badge: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
        minWidth: 24,
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: FontSizes.xs,
        fontWeight: '700',
    },
    list: {
        padding: Spacing.md,
    },
    card: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    cardInfo: {
        flex: 1,
    },
    amount: {
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        marginBottom: 2,
    },
    category: {
        fontSize: FontSizes.sm,
    },
    payee: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        marginBottom: Spacing.xs,
    },
    reason: {
        fontSize: FontSizes.sm,
        marginBottom: Spacing.xs,
    },
    time: {
        fontSize: FontSizes.xs,
        marginBottom: Spacing.md,
    },
    actions: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    button: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
        gap: Spacing.xs,
    },
    confirmButton: {},
    failButton: {},
    buttonText: {
        color: '#FFFFFF',
        fontSize: FontSizes.sm,
        fontWeight: '600',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xxl * 2,
    },
    emptyTitle: {
        fontSize: FontSizes.xl,
        fontWeight: '700',
        marginTop: Spacing.lg,
        marginBottom: Spacing.xs,
    },
    emptyText: {
        fontSize: FontSizes.md,
    },
    footer: {
        padding: Spacing.md,
        borderTopWidth: 1,
    },
    bulkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        gap: Spacing.sm,
    },
    bulkButtonText: {
        color: '#FFFFFF',
        fontSize: FontSizes.md,
        fontWeight: '700',
    },
});
