import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { Transaction } from '@/types/transaction';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface PaymentConfirmationDialogProps {
    visible: boolean;
    transaction: Transaction;
    confidence: number;
    primaryAction: 'confirmed' | 'failed';
    message: string;
    onConfirm: () => void;
    onFail: () => void;
    onDefer: () => void;
}

export function PaymentConfirmationDialog({
    visible,
    transaction,
    confidence,
    primaryAction,
    message,
    onConfirm,
    onFail,
    onDefer,
}: PaymentConfirmationDialogProps) {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onDefer}
        >
            <View style={styles.overlay}>
                <View style={[styles.dialog, { backgroundColor: colors.card }]}>
                    {/* Confidence Indicator */}
                    <View style={styles.confidenceBar}>
                        <View
                            style={[
                                styles.confidenceFill,
                                {
                                    width: `${confidence}%`,
                                    backgroundColor:
                                        confidence >= 70
                                            ? colors.success
                                            : confidence >= 40
                                                ? colors.warning
                                                : colors.error,
                                },
                            ]}
                        />
                    </View>

                    {/* Transaction Info */}
                    <View style={styles.transactionInfo}>
                        <Text style={[styles.amount, { color: colors.text }]}>
                            ₹{transaction.amount.toLocaleString('en-IN')}
                        </Text>
                        <Text style={[styles.payee, { color: colors.textSecondary }]}>
                            to {transaction.payeeName}
                        </Text>
                        <Text style={[styles.category, { color: colors.textSecondary }]}>
                            {transaction.category}
                            {transaction.reason && ` • ${transaction.reason}`}
                        </Text>
                    </View>

                    {/* Question */}
                    <Text style={[styles.question, { color: colors.text }]}>
                        {message}
                    </Text>

                    {/* Actions */}
                    <View style={styles.actions}>
                        {/* Primary action based on confidence */}
                        <TouchableOpacity
                            style={[
                                styles.button,
                                styles.primaryButton,
                                { backgroundColor: colors.tint },
                            ]}
                            onPress={primaryAction === 'confirmed' ? onConfirm : onFail}
                        >
                            <Ionicons
                                name={primaryAction === 'confirmed' ? 'checkmark-circle' : 'close-circle'}
                                size={20}
                                color="#FFFFFF"
                            />
                            <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                                {primaryAction === 'confirmed' ? 'Yes' : 'Yes, Failed'}
                            </Text>
                        </TouchableOpacity>

                        {/* Secondary action */}
                        <TouchableOpacity
                            style={[
                                styles.button,
                                styles.secondaryButton,
                                { borderColor: colors.border },
                            ]}
                            onPress={primaryAction === 'confirmed' ? onFail : onConfirm}
                        >
                            <Ionicons
                                name={primaryAction === 'confirmed' ? 'close-circle' : 'checkmark-circle'}
                                size={20}
                                color={colors.text}
                            />
                            <Text style={[styles.buttonText, { color: colors.text }]}>
                                {primaryAction === 'confirmed' ? 'No, Failed' : 'No, I Paid'}
                            </Text>
                        </TouchableOpacity>

                        {/* Defer button */}
                        <TouchableOpacity
                            style={[styles.button, styles.deferButton]}
                            onPress={onDefer}
                        >
                            <Text style={[styles.deferText, { color: colors.textSecondary }]}>
                                Ask Me Later
                            </Text>
                        </TouchableOpacity>
                    </View>


                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    dialog: {
        width: '100%',
        maxWidth: 400,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        backgroundColor: 'rgba(30, 58, 138, 0.95)', // Deep blue modal
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.3)',
        elevation: 10,
    },
    confidenceBar: {
        height: 4,
        backgroundColor: '#E5E5EA',
        borderRadius: 2,
        marginBottom: Spacing.lg,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        borderRadius: 2,
    },
    transactionInfo: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    amount: {
        fontSize: 32,
        fontWeight: '700',
        marginBottom: Spacing.xs,
    },
    payee: {
        fontSize: FontSizes.md,
        marginBottom: Spacing.xs,
    },
    category: {
        fontSize: FontSizes.sm,
    },
    question: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: Spacing.lg,
    },
    actions: {
        gap: Spacing.sm,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        gap: Spacing.xs,
    },
    primaryButton: {
        // backgroundColor set dynamically
    },
    secondaryButton: {
        borderWidth: 2,
    },
    deferButton: {
        padding: Spacing.sm,
    },
    buttonText: {
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    deferText: {
        fontSize: FontSizes.sm,
        textAlign: 'center',
    },
    hint: {
        fontSize: FontSizes.xs,
        textAlign: 'center',
        marginTop: Spacing.md,
    },
});
