import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { PendingManager, PendingTransaction } from '@/services/pending-manager';
import { saveTransaction } from '@/services/storage';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RecoverPendingScreen() {
    const [pendings, setPendings] = useState<PendingTransaction[]>([]);
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const insets = useSafeAreaInsets();

    useEffect(() => {
        loadPendings();
    }, []);

    const loadPendings = async () => {
        const activePendings = await PendingManager.getPendings();
        setPendings(activePendings);

        // If no pendings left, go back
        if (activePendings.length === 0) {
            router.replace('/(tabs)');
        }
    };

    const handleResolve = async (tx: PendingTransaction, status: 'confirmed' | 'cancelled') => {
        try {
            if (status === 'confirmed') {
                const amountNum = tx.paymentData.amount || 0;
                await saveTransaction(
                    tx.paymentData,
                    tx.category,
                    tx.reason,
                    amountNum,
                    tx.timestamp
                );
            }

            await PendingManager.resolvePending(tx.id, status);

            // Update local state
            setPendings(prev => prev.filter(p => p.id !== tx.id));

            if (pendings.length <= 1) {
                router.replace('/(tabs)');
            }
        } catch (error) {
            console.error('Failed to resolve pending:', error);
            Alert.alert('Error', 'Failed to save transaction');
        }
    };

    const getTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };

    // Match theme background
    const backgroundColor = colors.background;

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + Spacing.md, borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    Recover Payments
                </Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                    You opened a UPI app but didn't confirm the payment.
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {pendings.map((tx) => {
                    return (
                        <View key={tx.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                            <View style={styles.cardDetails}>
                                <View style={styles.detailRow}>
                                    <Text style={[styles.payeeName, { color: colors.text }]}>
                                        {tx.paymentData.payeeName}
                                    </Text>
                                    <Text style={[styles.amount, { color: colors.text }]}>
                                        ₹{tx.paymentData.amount?.toFixed(2) || '0.00'}
                                    </Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
                                        {getTimeAgo(tx.timestamp)}
                                    </Text>
                                    <View style={[styles.categoryTag, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>#{tx.category}</Text>
                                    </View>
                                </View>
                                {tx.reason && (
                                    <Text style={[styles.reason, { color: colors.textSecondary }]}>
                                        "{tx.reason}"
                                    </Text>
                                )}
                            </View>

                            <View style={styles.cardActions}>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.cancelButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                                    onPress={() => handleResolve(tx, 'cancelled')}
                                >
                                    <Ionicons name="close-outline" size={20} color={colors.text} />
                                    <Text style={[styles.actionText, { color: colors.text }]}>Didn't Pay</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.actionButton, styles.payButton, { backgroundColor: colors.tint }]}
                                    onPress={() => handleResolve(tx, 'confirmed')}
                                >
                                    <Ionicons name="checkmark-outline" size={20} color="#fff" />
                                    <Text style={[styles.actionText, { color: '#fff' }]}>Yes, Paid</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            <TouchableOpacity
                style={[styles.skipButton, { marginBottom: insets.bottom + Spacing.md }]}
                onPress={() => router.replace('/(tabs)')}
            >
                <Text style={[styles.skipText, { color: colors.textSecondary }]}>Decide Later</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.lg,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: FontSizes.xxl,
        fontWeight: '800',
        marginBottom: Spacing.xs,
    },
    headerSubtitle: {
        fontSize: FontSizes.md,
        lineHeight: 20,
    },
    scrollContent: {
        padding: Spacing.lg,
        gap: Spacing.md,
    },
    card: {
        padding: Spacing.lg,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
    },
    payeeName: {
        fontSize: FontSizes.lg,
        fontWeight: '700',
    },
    upiId: {
        fontSize: FontSizes.sm,
    },
    cardDetails: {
        marginBottom: Spacing.xl,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    amount: {
        fontSize: 24,
        fontWeight: '800',
    },
    timestamp: {
        fontSize: FontSizes.sm,
    },
    reason: {
        fontSize: FontSizes.md,
        fontStyle: 'italic',
        marginBottom: Spacing.sm,
    },
    categoryTag: {
        fontSize: FontSizes.xs,
        fontWeight: '600',
        alignSelf: 'flex-start',
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
    },
    cardActions: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
        gap: Spacing.xs,
    },
    cancelButton: {},
    payButton: {},
    actionText: {
        fontWeight: '700',
        fontSize: FontSizes.md,
    },
    skipButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
    },
    skipText: {
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
});
