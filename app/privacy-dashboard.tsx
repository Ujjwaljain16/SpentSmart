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

    // Match home/charts background
    const backgroundColor = colorScheme === 'dark' ? '#1E3A8A' : '#3B82F6';

    return (
        <View style={[styles.container, { backgroundColor }]}>
            <StatusBar style="light" />

            {/* Header */}
            <View
                style={[
                    styles.header,
                    {
                        paddingTop: insets.top + Spacing.sm,
                        backgroundColor: 'transparent',
                        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
                    },
                ]}
            >
                <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: '#FFF' }]}>
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
                            { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
                        ]}
                    >
                        <Ionicons name="shield-checkmark" size={64} color="#FFF" />
                    </View>
                    <Text style={[styles.heroTitle, { color: '#FFF' }]}>
                        Your Data, Your Control
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: 'rgba(255, 255, 255, 0.7)' }]}>
                        100% stored on this device • Zero cloud • Zero tracking
                    </Text>
                </View>

                {/* Data Inventory Card */}
                <View style={[styles.card, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="document-text" size={20} color="#3B82F6" />
                        <Text style={[styles.cardTitle, { color: '#FFF' }]}>
                            What We Store
                        </Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: 'rgba(255, 255, 255, 0.7)' }]}>
                            Transactions
                        </Text>
                        <Text style={[styles.statValue, { color: '#FFF' }]}>
                            {stats?.transactionCount || 0}
                        </Text>
                    </View>

                    <View style={[styles.divider, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]} />

                    <View style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: 'rgba(255, 255, 255, 0.7)' }]}>
                            Categories
                        </Text>
                        <Text style={[styles.statValue, { color: '#FFF' }]}>
                            {stats?.categoryCount || 0}
                        </Text>
                    </View>

                    <View style={[styles.divider, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]} />

                    <View style={styles.statRow}>
                        <Text style={[styles.statLabel, { color: 'rgba(255, 255, 255, 0.7)' }]}>
                            Total Storage
                        </Text>
                        <Text style={[styles.statValue, { color: '#FFF' }]}>
                            {formatBytes(stats?.totalStorageBytes || 0)}
                        </Text>
                    </View>
                </View>

                {/* Data Timeline Card */}
                {stats && stats.transactionCount > 0 && (
                    <View style={[styles.card, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}>
                        <View style={styles.cardHeader}>
                            <Ionicons name="time" size={20} color="#3B82F6" />
                            <Text style={[styles.cardTitle, { color: '#FFF' }]}>
                                Data Timeline
                            </Text>
                        </View>

                        {stats.oldestTransaction && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot}>
                                    <View
                                        style={[
                                            styles.timelineDotInner,
                                            { backgroundColor: '#3B82F6' },
                                        ]}
                                    />
                                </View>
                                <View style={styles.timelineContent}>
                                    <Text style={[styles.timelineLabel, { color: '#FFF' }]}>
                                        First transaction recorded
                                    </Text>
                                    <Text
                                        style={[
                                            styles.timelineDate,
                                            { color: 'rgba(255, 255, 255, 0.7)' },
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
                                            { backgroundColor: '#3B82F6' },
                                        ]}
                                    />
                                </View>
                                <View style={styles.timelineContent}>
                                    <Text style={[styles.timelineLabel, { color: '#FFF' }]}>
                                        Most recent transaction
                                    </Text>
                                    <Text
                                        style={[
                                            styles.timelineDate,
                                            { color: 'rgba(255, 255, 255, 0.7)' },
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
                                            { backgroundColor: '#3B82F6' },
                                        ]}
                                    />
                                </View>
                                <View style={styles.timelineContent}>
                                    <Text style={[styles.timelineLabel, { color: '#FFF' }]}>
                                        Total history
                                    </Text>
                                    <Text
                                        style={[
                                            styles.timelineDate,
                                            { color: 'rgba(255, 255, 255, 0.7)' },
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
                <View style={[styles.card, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}>
                    <View style={styles.cardHeader}>
                        <Ionicons name="lock-closed" size={20} color="#3B82F6" />
                        <Text style={[styles.cardTitle, { color: '#FFF' }]}>
                            Permissions
                        </Text>
                    </View>

                    <View style={styles.permissionItem}>
                        <Ionicons name="camera" size={20} color="rgba(255, 255, 255, 0.7)" />
                        <View style={styles.permissionText}>
                            <Text style={[styles.permissionName, { color: '#FFF' }]}>
                                Camera
                            </Text>
                            <Text
                                style={[
                                    styles.permissionStatus,
                                    { color: 'rgba(255, 255, 255, 0.5)' },
                                ]}
                            >
                                Optional • For QR code scanning only
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]} />

                    <View style={styles.permissionItem}>
                        <Ionicons
                            name="notifications"
                            size={20}
                            color="rgba(255, 255, 255, 0.7)"
                        />
                        <View style={styles.permissionText}>
                            <Text style={[styles.permissionName, { color: '#FFF' }]}>
                                Notifications
                            </Text>
                            <Text
                                style={[
                                    styles.permissionStatus,
                                    { color: 'rgba(255, 255, 255, 0.5)' },
                                ]}
                            >
                                Optional • For budget alerts only
                            </Text>
                        </View>
                    </View>

                    <View
                        style={[
                            styles.guaranteeBox,
                            { backgroundColor: 'rgba(74, 222, 128, 0.1)' },
                        ]}
                    >
                        <Text
                            style={[styles.guaranteeTitle, { color: '#4ADE80' }]}
                        >
                            ✓ Privacy Guarantee
                        </Text>
                        <Text style={[styles.guaranteeText, { color: '#FFF' }]}>
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
                    style={[styles.promiseCard, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 }]}
                >
                    <Text style={[styles.promiseTitle, { color: '#FFF' }]}>
                        Our Privacy Promise
                    </Text>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color="#4ADE80"
                        />
                        <Text style={[styles.promiseText, { color: 'rgba(255, 255, 255, 0.9)' }]}>
                            Your data never leaves this device
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color="#4ADE80"
                        />
                        <Text style={[styles.promiseText, { color: 'rgba(255, 255, 255, 0.9)' }]}>
                            No analytics or usage tracking
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color="#4ADE80"
                        />
                        <Text style={[styles.promiseText, { color: 'rgba(255, 255, 255, 0.9)' }]}>
                            No user accounts or cloud servers
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color="#4ADE80"
                        />
                        <Text style={[styles.promiseText, { color: 'rgba(255, 255, 255, 0.9)' }]}>
                            Open source and fully auditable
                        </Text>
                    </View>

                    <View style={styles.promiseItem}>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color="#4ADE80"
                        />
                        <Text style={[styles.promiseText, { color: 'rgba(255, 255, 255, 0.9)' }]}>
                            You can delete everything, anytime
                        </Text>
                    </View>
                </View>

                {/* Danger Zone */}
                <View style={[styles.dangerCard, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', borderWidth: 1 }]}>
                    <Text style={[styles.dangerTitle, { color: '#EF4444' }]}>
                        Danger Zone
                    </Text>

                    <TouchableOpacity
                        style={[
                            styles.dangerButton,
                            {
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                borderColor: '#EF4444',
                            },
                        ]}
                        onPress={handleClearAllData}
                    >
                        <Ionicons name="trash" size={20} color="#EF4444" />
                        <View style={styles.dangerButtonText}>
                            <Text style={[styles.dangerButtonLabel, { color: '#EF4444' }]}>
                                Delete All Data
                            </Text>
                            <Text
                                style={[
                                    styles.dangerButtonSubtext,
                                    { color: 'rgba(255, 255, 255, 0.6)' },
                                ]}
                            >
                                Permanently delete all transactions and categories
                            </Text>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={20}
                            color="rgba(255, 255, 255, 0.5)"
                        />
                    </TouchableOpacity>

                    <Text style={[styles.dangerWarning, { color: 'rgba(255, 255, 255, 0.5)' }]}>
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
