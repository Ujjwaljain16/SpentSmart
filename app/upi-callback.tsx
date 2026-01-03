import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { saveTransaction } from '@/services/storage';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function UPICallback() {
    const params = useLocalSearchParams<{
        status?: string;
        am?: string;
        tr?: string;
        pn?: string;
        pa?: string;
        tn?: string;
    }>();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];

    useEffect(() => {
        let isProcessing = false;

        const handleCallback = async () => {
            if (isProcessing) return;
            isProcessing = true;

            // UPI apps return status in 'status'
            // Common success values: 'success', 'SUCCESS', '00'
            const status = params.status?.toLowerCase();
            const isSuccess = status === 'success' || params.status === '00';

            if (isSuccess) {
                const amount = parseFloat(params.am || '0');
                if (amount > 0) {
                    await saveTransaction(
                        {
                            upiId: params.pa || 'unknown',
                            payeeName: params.pn || 'Income',
                            amount: amount,
                        },
                        'income', // Default category for incoming
                        params.tn || `Received via UPI Link: ${params.tr || ''}`,
                        amount,
                        Date.now(),
                        'income',
                        'upi',
                        params.tr // Pass tr as externalRef for duplicate prevention
                    );
                }
            } else if (status === 'failure' || status === 'failed') {
            }

            router.replace('/(tabs)');
        };

        handleCallback();
    }, [params]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.text, { color: colors.text }]}>Processing Payment...</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
});
