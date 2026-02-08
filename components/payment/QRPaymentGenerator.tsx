import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, ScrollView, ActivityIndicator, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { openUPIApp, UPI_APPS } from '@/services/upi-app-launcher';
import { PendingManager } from '@/services/pending-manager';
import { router } from 'expo-router';
import { requireNativeModule } from 'expo';

// Load UpiIntent native module (development build only)
let UpiIntent: any = null;
try {
    UpiIntent = requireNativeModule('UpiIntent');
} catch (e) {
    console.warn('UpiIntent native module not available (Expo Go)');
}

// Load UpiAppLauncher (development build only) - needs to be loaded dynamically
let UpiAppLauncher: any = null;
let LaunchResult: any = { Success: 'SUCCESS', Canceled: 'CANCELED', Failed: 'FAILED', Error: 'ERROR' };
try {
    // This will fail in Expo Go
    const launcher = require('@lokal-dev/react-native-upi-app-launcher');
    UpiAppLauncher = launcher.default;
    LaunchResult = launcher.LaunchResult || LaunchResult;
} catch (e) {
    console.warn('UpiAppLauncher not available (Expo Go - requires dev build)');
}

interface QRGeneratorProps {
    upiUrl: string;
    payeeName: string;
    upiId: string;
    amount?: number;
    onClose: () => void;
}

export function QRPaymentGenerator({
    upiUrl,
    payeeName,
    upiId,
    amount,
    onClose
}: QRGeneratorProps) {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const qrRef = useRef<ViewShot>(null);
    const [isSharing, setIsSharing] = useState(false);

    // Open UPI app with payment data
    // - GPay: Supports image sharing (ACTION_SEND with QR image)
    // - PhonePe/Paytm: Use UpiAppLauncher for proper result callbacks
    const shareToApp = async (packageName: string, appName: string) => {
        // Check if UpiAppLauncher is available (Android only, dev build required)
        const useNewLauncher = UpiAppLauncher?.isAvailable?.() ?? false;

        // Apps that work better with the new UPI launcher (direct intent with callbacks)
        const directIntentApps = ['com.phonepe.app', 'net.one97.paytm'];

        setIsSharing(true);
        try {
            // PhonePe/Paytm: Use the new UpiAppLauncher (gives success/fail/cancel)
            if (useNewLauncher && directIntentApps.includes(packageName)) {
                const result = await UpiAppLauncher.launchUpiApp({
                    packageName: packageName,
                    url: upiUrl,
                });

                if (result.result === LaunchResult.Success) {
                    Alert.alert('Payment Initiated', 'Check your UPI app to confirm the payment status.');
                } else if (result.result === LaunchResult.Canceled) {
                    Alert.alert('Cancelled', 'Payment was cancelled.');
                    return;
                } else {
                    // Failed or Error
                    Alert.alert('Payment Failed', result.error || `${appName} could not process the request.`);
                    return;
                }
            }
            // Google Pay: Use image sharing (ACTION_SEND) - scans QR from image
            else if (UpiIntent?.shareTo && packageName === 'com.google.android.apps.nbu.paisa.user') {
                // Capture QR as image
                if (qrRef.current?.capture) {
                    const capturedUri = await qrRef.current.capture();
                    const fileUri = capturedUri.startsWith('file://')
                        ? capturedUri
                        : `file://${capturedUri}`;
                    const success = await UpiIntent.shareTo(packageName, fileUri);

                    if (!success) {
                        Alert.alert('App Not Available', `${appName} is not installed.`);
                        return;
                    }
                }
            }
            // Fallback: Use system chooser via UpiAppLauncher
            else if (useNewLauncher) {
                const result = await UpiAppLauncher.launchUpiApp({
                    url: upiUrl, // No packageName = shows chooser
                });

                if (result.result !== LaunchResult.Success) {
                    Alert.alert('Payment Issue', result.error || 'Could not launch UPI app.');
                    return;
                }
            }
            // Last resort: Linking.openURL
            else {
                const canOpen = await Linking.canOpenURL(upiUrl);
                if (canOpen) {
                    await Linking.openURL(upiUrl);
                } else {
                    Alert.alert('No UPI App', 'No UPI app found to handle this payment.');
                    return;
                }
            }

            // Save as pending for tracking
            await PendingManager.savePending({
                id: `qr_share_${Date.now()}`,
                paymentData: {
                    upiId,
                    payeeName,
                    amount: amount || 0,
                    transactionNote: '',
                },
                category: 'other',
                reason: `Payment via ${appName}`,
                timestamp: Date.now(),
                status: 'pending',
            });

            // Navigate back after a short delay
            setTimeout(() => {
                onClose();
                router.replace('/(tabs)');
            }, 500);
        } catch (error) {
            console.error('Error launching UPI app:', error);
            Alert.alert('Error', 'Failed to open UPI app. Please try again.');
        } finally {
            setIsSharing(false);
        }
    };

    const saveQRToGallery = async () => {
        try {
            // Request media library permissions
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Please grant gallery access to save QR code');
                return;
            }

            // Capture the QR view as image
            if (qrRef.current?.capture) {
                const uri = await qrRef.current.capture();

                // Save to gallery
                const asset = await MediaLibrary.saveToLibraryAsync(uri);

                // Don't use deep linking - just open the app
                Alert.alert(
                    'QR Code Saved!',
                    'Open your UPI app and scan the QR from gallery. Mark as pending to track this expense.',
                    [
                        {
                            text: 'Mark as Pending',
                            onPress: async () => {
                                // Save as pending transaction
                                await PendingManager.savePending({
                                    id: `qr_${Date.now()}`,
                                    paymentData: {
                                        upiId,
                                        payeeName,
                                        amount: amount || 0,
                                        transactionNote: '',
                                    },
                                    category: 'other',
                                    reason: 'QR Code Payment',
                                    timestamp: Date.now(),
                                    status: 'pending',
                                });
                                onClose();
                                // Navigate to pending transactions
                                router.push('/pending-transactions');
                            },
                            style: 'default'
                        },
                        {
                            text: 'Open GPay',
                            onPress: async () => {
                                try {
                                    await openUPIApp('gpay');
                                } catch (error) {
                                    Alert.alert('GPay not installed', 'Please install Google Pay');
                                }
                            }
                        },
                        {
                            text: 'Open PhonePe',
                            onPress: async () => {
                                try {
                                    await openUPIApp('phonepe');
                                } catch (error) {
                                    Alert.alert('PhonePe not installed', 'Please install PhonePe');
                                }
                            }
                        },
                        {
                            text: 'Done',
                            onPress: onClose,
                            style: 'cancel'
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Error saving QR:', error);
            Alert.alert('Error', 'Failed to save QR code. Please try again.');
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Scannable QR Code</Text>
                <View style={styles.closeButton} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.content, { flex: undefined, flexGrow: 1 }]}
                showsVerticalScrollIndicator={false}
            >
                <ViewShot ref={qrRef} options={{ format: 'png', quality: 1.0 }}>
                    <View style={[styles.qrContainer, { backgroundColor: '#FFFFFF' }]}>
                        <Text style={styles.qrTitle}>Scan in UPI App</Text>

                        <View style={styles.qrWrapper}>
                            <QRCode
                                value={upiUrl}
                                size={250}
                                backgroundColor="white"
                                color="black"
                            />
                        </View>

                        <View style={styles.qrDetails}>
                            <Text style={styles.qrPayeeName}>{payeeName}</Text>
                            <Text style={styles.qrUpiId}>{upiId}</Text>
                            {!!amount && amount > 0 && (
                                <Text style={styles.qrAmount}>₹{amount.toFixed(2)}</Text>
                            )}
                        </View>
                    </View>
                </ViewShot>

                {/* Quick Share Buttons - Google Pay Only */}
                <View style={styles.shareSection}>
                    <Text style={[styles.instructionTitle, { color: colors.text, textAlign: 'center', marginBottom: Spacing.md }]}>
                        Open in Google Pay
                    </Text>

                    <View style={styles.shareButtonsRow}>
                        {/* Google Pay */}
                        <TouchableOpacity
                            style={[styles.shareAppButton, { backgroundColor: '#1a73e8', minWidth: 200 }]}
                            onPress={() => shareToApp('com.google.android.apps.nbu.paisa.user', 'Google Pay')}
                            disabled={isSharing}
                        >
                            {isSharing ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="logo-google" size={24} color="#fff" />
                                    <Text style={[styles.shareAppButtonText, { fontSize: FontSizes.md }]}>Google Pay</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: Spacing.md }]}>
                        <Ionicons name="flash" size={16} color={colors.tint} />
                        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                            One-tap payment: Opens GPay with amount prefilled
                        </Text>
                    </View>
                </View>

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Save to Gallery */}
                <View style={styles.manualSection}>
                    <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, marginTop: 0 }]}
                        onPress={saveQRToGallery}
                    >
                        <Ionicons name="download-outline" size={18} color={colors.text} />
                        <Text style={[styles.saveButtonText, { color: colors.text }]}>Save QR to Gallery</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView >
        </View >
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
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
    },
    content: {
        flex: 1,
        padding: Spacing.lg,
        alignItems: 'center',
    },
    qrContainer: {
        padding: Spacing.xl,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
        elevation: 4,
    },
    qrTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '700',
        color: '#000',
        marginBottom: Spacing.md,
    },
    qrWrapper: {
        padding: Spacing.md,
        backgroundColor: '#FFFFFF',
        borderRadius: BorderRadius.md,
    },
    qrDetails: {
        marginTop: Spacing.lg,
        alignItems: 'center',
    },
    qrPayeeName: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        color: '#000',
        marginBottom: 4,
    },
    qrUpiId: {
        fontSize: FontSizes.sm,
        color: '#666',
        marginBottom: 8,
    },
    qrAmount: {
        fontSize: FontSizes.xl,
        fontWeight: '700',
        color: '#000',
    },
    instructions: {
        marginTop: Spacing.xl,
        width: '100%',
    },
    instructionTitle: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        marginBottom: Spacing.sm,
    },
    stepContainer: {
        marginBottom: Spacing.md,
    },
    step: {
        fontSize: FontSizes.sm,
        marginBottom: 6,
        paddingLeft: Spacing.sm,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        gap: Spacing.sm,
    },
    infoText: {
        flex: 1,
        fontSize: FontSizes.xs,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xl,
        borderRadius: BorderRadius.md,
        marginTop: Spacing.xl,
        gap: Spacing.sm,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    // New styles for share section
    shareSection: {
        marginTop: Spacing.xl,
        width: '100%',
        alignItems: 'center',
    },
    shareButtonsRow: {
        flexDirection: 'row',
        gap: Spacing.md,
        justifyContent: 'center',
    },
    shareAppButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.md,
        gap: Spacing.sm,
        minWidth: 140,
    },
    shareAppButtonText: {
        color: '#fff',
        fontSize: FontSizes.sm,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        width: '80%',
        marginVertical: Spacing.xl,
        alignSelf: 'center',
    },
    manualSection: {
        alignItems: 'center',
        paddingBottom: Spacing.xl,
    },
    manualTitle: {
        fontSize: FontSizes.sm,
        marginBottom: Spacing.md,
    },
});
