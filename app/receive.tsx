import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Share,
    Alert,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import QRCode from 'react-native-qrcode-svg';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserProfile, saveUserProfile } from '@/services/user-service';
import { buildUPICollectUrl } from '@/constants/upi-config';
import { saveTransaction } from '@/services/storage';

export default function ReceiveScreen() {
    const [upiId, setUpiId] = useState('');
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [isProfileSet, setIsProfileSet] = useState(false);
    const [showQR, setShowQR] = useState(false);

    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        const profile = await getUserProfile();
        if (profile) {
            setUpiId(profile.upiId);
            setName(profile.name);
            setIsProfileSet(true);
        }
    };

    const handleSaveProfile = async () => {
        if (!upiId.includes('@')) {
            Alert.alert('Invalid UPI ID', 'Please enter a valid UPI ID (e.g., user@bank)');
            return;
        }
        const success = await saveUserProfile({ upiId, name: name || 'User' });
        if (success) {
            setIsProfileSet(true);
        } else {
            Alert.alert('Error', 'Failed to save profile');
        }
    };

    const handleShare = async () => {
        const callbackUrl = Linking.createURL('upi-callback');
        const upiUrl = buildUPICollectUrl({
            upiId,
            payeeName: name,
            amount: parseFloat(amount) || undefined,
            transactionNote: note || undefined,
            callbackUrl,
        });

        try {
            await Share.share({
                message: `Pay me ${amount ? `₹${amount}` : ''} using this UPI link: ${upiUrl}`,
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const upiUrlForQR = buildUPICollectUrl({
        upiId,
        payeeName: name,
        amount: parseFloat(amount) || undefined,
        transactionNote: note || undefined,
        callbackUrl: Linking.createURL('upi-callback'),
    });

    // Use theme background

    if (!isProfileSet) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
                <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
                    <TouchableOpacity onPress={() => router.back()} style={[styles.headerButton, { backgroundColor: colors.card }]}>
                        <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Setup UPI Profile</Text>
                    <View style={{ width: 40 }} />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.content}>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Your UPI ID</Text>
                            <TextInput
                                style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                                value={upiId}
                                onChangeText={setUpiId}
                                placeholder="username@bank"
                                placeholderTextColor={colors.textSecondary}
                                autoCapitalize="none"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Your Name</Text>
                            <TextInput
                                style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                                value={name}
                                onChangeText={setName}
                                placeholder="Payee Name"
                                placeholderTextColor={colors.textSecondary}
                            />
                        </View>
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.tint }]} onPress={handleSaveProfile}>
                            <Text style={styles.primaryButtonText}>Continue</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.headerButton, { backgroundColor: colors.card }]}>
                    <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Receive Money</Text>
                <TouchableOpacity onPress={() => setIsProfileSet(false)} style={[styles.headerButton, { backgroundColor: colors.card }]}>
                    <Ionicons name="settings-outline" size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Requesting Amount (Optional)</Text>
                    <View style={styles.amountInputRow}>
                        <Text style={[styles.currency, { color: colors.text }]}>₹</Text>
                        <TextInput
                            style={[styles.amountInput, { color: colors.text }]}
                            value={amount}
                            onChangeText={setAmount}
                            placeholder="0"
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="decimal-pad"
                        />
                    </View>
                </View>

                <View style={[styles.inputGroup, { marginBottom: Spacing.xl }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Note (Optional)</Text>
                    <TextInput
                        style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                        value={note}
                        onChangeText={setNote}
                        placeholder="What's this for?"
                        placeholderTextColor={colors.textSecondary}
                    />
                </View>

                <View style={styles.qrContainer}>
                    <View style={styles.qrWrapper}>
                        <QRCode
                            value={upiUrlForQR}
                            size={200}
                            color="#000"
                            backgroundColor="#FFF"
                        />
                    </View>
                    <Text style={[styles.upiIdText, { color: colors.text }]}>{upiId}</Text>
                    <Text style={[styles.payeeNameText, { color: colors.textSecondary }]}>{name}</Text>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.tint }]} onPress={handleShare}>
                        <Ionicons name="share-social-outline" size={24} color="#FFF" />
                        <Text style={styles.actionButtonText}>Share Payment Link</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { marginTop: 12, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                        onPress={() => {
                            Alert.alert('Manual Record', 'Did you receive this payment?', [
                                { text: 'No', style: 'cancel' },
                                {
                                    text: 'Yes, Record Income',
                                    onPress: async () => {
                                        const parsedAmount = parseFloat(amount);
                                        if (!parsedAmount || isNaN(parsedAmount)) {
                                            Alert.alert('Error', 'Please enter an amount to record');
                                            return;
                                        }
                                        await saveTransaction(
                                            { upiId: 'manual', payeeName: 'Cash/Other' },
                                            'income',
                                            note || 'Manual Income Record',
                                            parsedAmount,
                                            Date.now(),
                                            'income',
                                            'cash'
                                        );
                                        router.replace('/(tabs)');
                                    }
                                }
                            ]);
                        }}
                    >
                        <Ionicons name="checkmark-circle-outline" size={24} color={colors.text} />
                        <Text style={[styles.actionButtonText, { color: colors.text }]}>Record Manually</Text>
                    </TouchableOpacity>
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
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
    },
    headerButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '700',
    },
    content: {
        padding: Spacing.lg,
        alignItems: 'center',
    },
    inputGroup: {
        width: '100%',
        marginBottom: Spacing.lg,
    },
    label: {
        color: 'rgba(255,255,255,0.7)',
        marginBottom: Spacing.xs,
        fontSize: FontSizes.sm,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.md,
        color: '#FFF',
        padding: Spacing.md,
        fontSize: FontSizes.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    primaryButton: {
        backgroundColor: '#FFF',
        width: '100%',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        marginTop: Spacing.md,
    },
    primaryButtonText: {
        color: '#1E3A8A',
        fontWeight: '700',
        fontSize: FontSizes.md,
    },
    amountCard: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
        alignItems: 'center',
    },
    amountLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: FontSizes.sm,
        marginBottom: Spacing.sm,
    },
    amountInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    currency: {
        fontSize: 32,
        color: '#FFF',
        fontWeight: '700',
        marginRight: 4,
    },
    amountInput: {
        fontSize: 48,
        color: '#FFF',
        fontWeight: '700',
        minWidth: 100,
        textAlign: 'center',
    },
    qrContainer: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    qrWrapper: {
        backgroundColor: '#FFF',
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.md,
    },
    upiIdText: {
        color: '#FFF',
        fontSize: FontSizes.md,
        fontWeight: '600',
        opacity: 0.9,
    },
    payeeNameText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: FontSizes.sm,
        marginTop: 2,
    },
    actions: {
        width: '100%',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        gap: Spacing.sm,
    },
    actionButtonText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: FontSizes.md,
    },
});
