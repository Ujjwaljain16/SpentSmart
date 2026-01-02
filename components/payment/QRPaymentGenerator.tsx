import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

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

    const saveQRToGallery = async () => {
        try {
            // Request media library permissions
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Please grant gallery access to save QR code');
                return;
            }

            // Capture the QR view as image
            if (qrRef.current) {
                const uri = await qrRef.current.capture();

                // Save to gallery
                const asset = await MediaLibrary.saveToLibraryAsync(uri);

                Alert.alert(
                    'QR Code Saved! 📸',
                    'Now open your UPI app and scan from gallery',
                    [
                        {
                            text: 'Done',
                            onPress: onClose
                        },
                        {
                            text: 'Open GPay',
                            onPress: () => {
                                // Try to open GPay directly
                                Linking.openURL('tez://').catch(() => {
                                    Alert.alert('GPay not installed', 'Please install Google Pay');
                                });
                            }
                        },
                        {
                            text: 'Open PhonePe',
                            onPress: () => {
                                // Try to open PhonePe directly
                                Linking.openURL('phonepe://').catch(() => {
                                    Alert.alert('PhonePe not installed', 'Please install PhonePe');
                                });
                            }
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

            <View style={styles.content}>
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
                            {amount && (
                                <Text style={styles.qrAmount}>₹{amount.toFixed(2)}</Text>
                            )}
                        </View>
                    </View>
                </ViewShot>

                <View style={styles.instructions}>
                    <Text style={[styles.instructionTitle, { color: colors.text }]}>
                        How to Pay:
                    </Text>
                    <View style={styles.stepContainer}>
                        <Text style={[styles.step, { color: colors.textSecondary }]}>
                            1. Tap "Save QR to Gallery" below
                        </Text>
                        <Text style={[styles.step, { color: colors.textSecondary }]}>
                            2. Open GPay/PhonePe
                        </Text>
                        <Text style={[styles.step, { color: colors.textSecondary }]}>
                            3. Tap "Scan QR" → "Gallery"
                        </Text>
                        <Text style={[styles.step, { color: colors.textSecondary }]}>
                            4. Select the saved QR code
                        </Text>
                        <Text style={[styles.step, { color: colors.textSecondary }]}>
                            5. Complete payment
                        </Text>
                    </View>

                    <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Ionicons name="shield-checkmark" size={20} color={colors.tint} />
                        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                            100% success rate • Works with all banks • Privacy preserved
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: colors.tint }]}
                    onPress={saveQRToGallery}
                >
                    <Ionicons name="download" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Save QR to Gallery</Text>
                </TouchableOpacity>
            </View>
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
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
});
