import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { format } from 'date-fns';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    getPrivacyStats,
    formatBytes,
    getPermissionStatus,
    PrivacyStats,
} from '@/services/privacy-stats';
import { clearAllData } from '@/services/storage';

export default function PrivacyDashboardScreen() {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const insets = useSafeAreaInsets();

    const [stats, setStats] = useState<PrivacyStats | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const privacyStats = await getPrivacyStats();
            setStats(privacyStats);
        } catch (error) {
            console.error('Error loading privacy stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadStats();
        }, [loadStats])
    );

    const handleClose = () => {
        router.back();
    };

    const handleClearAllData = () => {
        Alert.alert(
            'Delete All Data',
            `This will permanently delete all ${stats?.transactionCount || 0} transactions and ${stats?.categoryCount || 0} categories. This action cannot be undone.\n\nYour data is stored only on this device. Once deleted, it cannot be recovered.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Everything',
                    style: 'destructive',
                    onPress: async () => {
                        const success = await clearAllData();
                        if (success) {
                            await loadStats();
                            Alert.alert('Success', 'All data has been permanently deleted.');
                        } else {
                            Alert.alert('Error', 'Failed to delete data. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const permissions = getPermissionStatus();

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            {/* Header */}
            <View
                style={[
                    styles.header,
                    {
                        paddingTop: insets.top + Spacing.sm,
                        backgroundColor: colors.surface,
                        borderBottomColor: colors.border,
                    },
                ]}
            >
                <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    Privacy Dashboard
                </Text>
                <View style={styles.headerButton} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Section */}
                <View style={styles.heroSection}>
                    <View
                        style={[
                            styles.shieldContainer,
                            { backgroundColor: `${colors.tint}20` },
                        ]}
                    >
                        <Ionicons name="shield-checkmark" size={64} color={colors.tint} />
                    </View>
                    <Text style={[styles.heroTitle, { color: colors.text }]}>
                        Your Data, Your Control
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                        100% stored on this device • Zero cloud • Zero tracking
                    </Text>
                </View>

                {/* Data Inventory Card */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="document-text" size={20} color={colors.tint} />
                        <Text style={[styles.cardTitle, { color: colors.text }]}>
                            What We Store
                        </Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            Transactions
                        </Text>
                        <Text style={[styles.statValue, { color: colors.text }]}>
                            {stats?.transactionCount || 0}
                        </Text>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            Categories
                        </Text>
                        <Text style={[styles.statValue, { color: colors.text }]}>
                            {stats?.categoryCount || 0}
                        </Text>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                            Total Storage
                        </Text>
                        <Text style={[styles.statValue, { color: colors.text }]}>
                            {formatBytes(stats?.totalStorageBytes || 0)}
                        </Text>
                    </View>
                </View>

                {/* Data Timeline Card */}
                {stats && stats.transactionCount > 0 && (
                    <View style={[styles.card, { backgroundColor: colors.card }]}>
                        <View style={styles.cardHeader}>
                            <Ionicons name="time" size={20} color={colors.tint} />
                            <Text style={[styles.cardTitle, { color: colors.text }]}>
                                Data Timeline
                            </Text>
                        </View>

                        {stats.oldestTransaction && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot}>
                                    <View
                                        style={[
                                            styles.timelineDotInner,
                                            { backgroundColor: colors.tint },
                                        ]}
                                    />
                                </View>
                                <View style={styles.timelineContent}>
                                    <Text style={[styles.timelineLabel, { color: colors.text }]}>
                                        First transaction recorded
                                    </Text>
                                    <Text
                                        style={[
                                            styles.timelineDate,
                                            { color: colors.textSecondary },
                                        ]}
                                    >
                                        {format(new Date(stats.oldestTransaction), 'MMM d, yyyy')}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {stats.newestTransaction && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot}>
                                    <View
                                        style={[
                                            styles.timelineDotInner,
                                            { backgroundColor: colors.tint },
                                        ]}
                                    />
                                </View>
                                <View style={styles.timelineContent}>
                                    <Text style={[styles.timelineLabel, { color: colors.text }]}>
                                        Most recent transaction
                                    </Text>
                                    <Text
                                        style={[
                                            styles.timelineDate,
                                            { color: colors.textSecondary },
                                        ]}
                                    >
                                        {format(new Date(stats.newestTransaction), 'MMM d, yyyy')}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {stats.dataAgeDays !== undefined && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot}>
                                    <View
                                        style={[
                                            styles.timelineDotInner,
                                            { backgroundColor: colors.tint },
                                        ]}
                                    />
                                </View>
                                <View style={styles.timelineContent}>
                                    <Text style={[styles.timelineLabel, { color: colors.text }]}>
                                        Total history
                                    </Text>
                                    <Text
                                        style={[
                                            styles.timelineDate,
                                            { color: colors.textSecondary },
                                        ]}
                                    >
                                        {stats.dataAgeDays} days
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}

                {/* Permissions Card */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="lock-closed" size={20} color={colors.tint} />
                        <Text style={[styles.cardTitle, { color: colors.text }]}>
                            Permissions
                        </Text>
                    </View>

                    <View style={styles.permissionItem}>
                        <Ionicons name="camera" size={20} color={colors.textSecondary} />
                        <View style={styles.permissionText}>
                            <Text style={[styles.permissionName, { color: colors.text }]}>
                                Camera
                            </Text>
                            <Text
                                style={[
                                    styles.permissionStatus,
                                    { color: colors.textSecondary },
                                ]}
                            >
                                Optional • For QR code scanning only
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.permissionItem}>
                        <Ionicons
                            name="notifications"
                            size={20}
                            color={colors.textSecondary}
                        />
                        <View style={styles.permissionText}>
                            <Text style={[styles.permissionName, { color: colors.text }]}>
                                Notifications
                            </Text>
                            <Text
                                style={[
                                    styles.permissionStatus,
                                    { color: colors.textSecondary },
                                ]}
                            >
                                Optional • For budget alerts only
                            </Text>
                        </View>
                    </View>

                    <View
                        style={[
                            styles.guaranteeBox,
                            { backgroundColor: `${colors.success}10` },
                        ]}
                    >
                        <Text
                            style={[styles.guaranteeTitle, { color: colors.success }]}
                        >
                            ✓ Privacy Guarantee
                        </Text>
                        <Text style={[styles.guaranteeText, { color: colors.text }]}>
                            ✓ No SMS access {'\n'}
                            ✓ No contacts access {'\n'}
                            ✓ No location tracking {'\n'}
                            ✓ No cloud sync required {'\n'}
                            ✓ No user accounts {'\n'}
                            ✓ No analytics or tracking
                        </Text>
                    </View>
                </View>

                {/* Privacy Promise Card */}
                <View
                    style={[styles.promiseCard, { backgroundColor: colors.card }]}
                >
                    <Text style={[styles.promiseTitle, { color: colors.text }]}>
                        Our Privacy Promise
                    </Text>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={colors.success}
                        />
                        <Text style={[styles.promiseText, { color: colors.text }]}>
                            Your data never leaves this device
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={colors.success}
                        />
                        <Text style={[styles.promiseText, { color: colors.text }]}>
                            No analytics or usage tracking
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={colors.success}
                        />
                        <Text style={[styles.promiseText, { color: colors.text }]}>
                            No user accounts or cloud servers
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={colors.success}
                        />
                        <Text style={[styles.promiseText, { color: colors.text }]}>
                            Open source and fully auditable
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={colors.success}
                        />
                        <Text style={[styles.promiseText, { color: colors.text }]}>
                            You can delete everything, anytime
                        </Text>
                    </View>
                </View>

                {/* Danger Zone */}
                <View style={[styles.dangerCard, { backgroundColor: colors.card }]}>
                    <Text style={[styles.dangerTitle, { color: colors.error }]}>
                        Danger Zone
                    </Text>

                    <TouchableOpacity
                        style={[
                            styles.dangerButton,
                            {
                                backgroundColor: `${colors.error}10`,
                                borderColor: colors.error,
                            },
                        ]}
                        onPress={handleClearAllData}
                    >
                        <Ionicons name="trash" size={20} color={colors.error} />
                        <View style={styles.dangerButtonText}>
                            <Text style={[styles.dangerButtonLabel, { color: colors.error }]}>
                                Delete All Data
                            </Text>
                            <Text
                                style={[
                                    styles.dangerButtonSubtext,
                                    { color: colors.textSecondary },
                                ]}
                            >
                                Permanently delete all transactions and categories
                            </Text>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.textSecondary}
                        />
                    </TouchableOpacity>

                    <Text style={[styles.dangerWarning, { color: colors.textSecondary }]}>
                        ⚠️ Data deletion is permanent and immediate. Make sure to export
                        your data first if you want to keep a backup.
                    </Text>
                </View>

                {/* Bottom Padding */}
                <View style={{ height: Spacing.xl }} />
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
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
    },
    headerButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: Spacing.lg,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    shieldContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    heroTitle: {
        fontSize: FontSizes.xxl,
        fontWeight: '700',
        marginBottom: Spacing.xs,
        textAlign: 'center',
    },
    heroSubtitle: {
        fontSize: FontSizes.sm,
        textAlign: 'center',
        lineHeight: 20,
    },
    card: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    cardTitle: {
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    statLabel: {
        fontSize: FontSizes.md,
    },
    statValue: {
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        marginVertical: Spacing.xs,
    },
    timelineItem: {
        flexDirection: 'row',
        marginBottom: Spacing.md,
    },
    timelineDot: {
        width: 24,
        alignItems: 'center',
        paddingTop: 4,
    },
    timelineDotInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    timelineContent: {
        flex: 1,
        marginLeft: Spacing.sm,
    },
    timelineLabel: {
        fontSize: FontSizes.md,
        marginBottom: 2,
    },
    timelineDate: {
        fontSize: FontSizes.sm,
    },
    permissionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
        gap: Spacing.md,
    },
    permissionText: {
        flex: 1,
    },
    permissionName: {
        fontSize: FontSizes.md,
        marginBottom: 2,
    },
    permissionStatus: {
        fontSize: FontSizes.sm,
    },
    guaranteeBox: {
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginTop: Spacing.md,
    },
    guaranteeTitle: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        marginBottom: Spacing.sm,
    },
    guaranteeText: {
        fontSize: FontSizes.sm,
        lineHeight: 20,
    },
    promiseCard: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    promiseTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        marginBottom: Spacing.md,
    },
    promiseItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.sm,
        gap: Spacing.sm,
    },
    promiseText: {
        fontSize: FontSizes.md,
        flex: 1,
    },
    dangerCard: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    dangerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        marginBottom: Spacing.md,
    },
    dangerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    dangerButtonText: {
        flex: 1,
    },
    dangerButtonLabel: {
        fontSize: FontSizes.md,
        fontWeight: '500',
        marginBottom: 2,
    },
    dangerButtonSubtext: {
        fontSize: FontSizes.sm,
    },
    dangerWarning: {
        fontSize: FontSizes.sm,
        lineHeight: 18,
    },
});
