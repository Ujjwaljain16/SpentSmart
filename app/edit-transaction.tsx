import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { CategoryType } from '@/types/transaction';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { updateTransaction, getAllTransactions } from '@/services/storage';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function EditTransactionScreen() {
    const params = useLocalSearchParams<{
        id: string;
        amount: string;
        category: string;
        reason?: string;
        payeeName: string;
        upiId: string;
        type: string;
        paymentMethod: string;
    }>();

    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const insets = useSafeAreaInsets();

    // Form state
    const [amount, setAmount] = useState(params.amount || '');
    const [category, setCategory] = useState<CategoryType | null>(
        (params.category as CategoryType) || null
    );
    const [reason, setReason] = useState(params.reason || '');
    const [type, setType] = useState<'income' | 'expense'>(
        (params.type as 'income' | 'expense') || 'expense'
    );
    const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cash' | 'bank' | 'other'>(
        (params.paymentMethod as any) || 'upi'
    );
    const [isLoading, setIsLoading] = useState(false);

    const canSave = amount && parseFloat(amount) > 0 && category;

    const handleSave = async () => {
        if (!canSave || !params.id) {
            Alert.alert('Missing Information', 'Please fill in all required fields.');
            return;
        }

        setIsLoading(true);

        try {
            const amountNum = parseFloat(amount);

            const success = await updateTransaction(params.id, {
                amount: amountNum,
                category: category!,
                reason: reason.trim() || undefined,
                type,
                paymentMethod,
            });

            if (success) {
                Alert.alert('Success', 'Transaction updated successfully.', [
                    {
                        text: 'OK',
                        onPress: () => router.back(),
                    },
                ]);
            } else {
                Alert.alert('Error', 'Failed to update transaction. Please try again.');
            }
        } catch (error) {
            console.error('Update error:', error);
            Alert.alert('Error', 'Failed to update transaction. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        router.back();
    };

    // Match home/charts background
    const isDark = colorScheme === 'dark';

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar style="light" />

            {/* Header */}
            <View
                style={[
                    styles.header,
                    {
                        paddingTop: insets.top + Spacing.sm,
                        backgroundColor: 'transparent',
                        borderBottomWidth: 0,
                    },
                ]}
            >
                <TouchableOpacity onPress={handleCancel} style={[styles.headerButton, { backgroundColor: colors.card, borderRadius: BorderRadius.full, width: 40, height: 40 }]}>
                    <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    Edit Transaction
                </Text>
                <TouchableOpacity
                    onPress={handleSave}
                    style={styles.headerButton}
                    disabled={!canSave || isLoading}
                >
                    <Text
                        style={[
                            styles.saveText,
                            {
                                color: canSave && !isLoading ? colors.tint : colors.textSecondary,
                            },
                        ]}
                    >
                        Save
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Type Toggle */}
                <View style={[styles.typeToggleContainer, { backgroundColor: colors.card, gap: 8 }]}>
                    <TouchableOpacity
                        style={[
                            styles.typeOption,
                            type === 'expense' && styles.typeOptionActive,
                            { backgroundColor: type === 'expense' ? colors.error : 'transparent' }
                        ]}
                        onPress={() => {
                            setType('expense');
                            if (category === 'income') setCategory('food');
                        }}
                    >
                        <Text style={[styles.typeText, { color: type === 'expense' ? '#FFF' : colors.textSecondary }]}>Expense</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.typeOption,
                            type === 'income' && styles.typeOptionActive,
                            { backgroundColor: type === 'income' ? colors.success : 'transparent' }
                        ]}
                        onPress={() => {
                            setType('income');
                            setCategory('income');
                        }}
                    >
                        <Text style={[styles.typeText, { color: type === 'income' ? '#FFF' : colors.textSecondary }]}>Income</Text>
                    </TouchableOpacity>
                </View>

                {/* Payee Info (Read-only) */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        {type === 'income' ? 'Payer' : 'Payee'}
                    </Text>
                    <Text style={[styles.payeeText, { color: colors.text }]}>
                        {params.payeeName}
                    </Text>
                    <Text style={[styles.upiText, { color: colors.textSecondary }]}>
                        {params.upiId === 'manual' ? 'Manual Record' : params.upiId}
                    </Text>
                </View>

                {/* Amount Input */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Amount *
                    </Text>
                    <View style={styles.amountInputContainer}>
                        <Text style={[styles.currencySymbol, { color: colors.text }]}>
                            ₹
                        </Text>
                        <TextInput
                            style={[styles.amountInput, { color: colors.text }]}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            placeholder="0.00"
                            placeholderTextColor={colors.textSecondary}
                            selectTextOnFocus
                        />
                    </View>
                </View>

                {/* Category Picker */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Category *
                    </Text>
                    <CategoryPicker
                        selectedCategory={category}
                        onSelectCategory={setCategory}
                        mode="chips"
                    />
                </View>

                {/* Payment Method */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Payment Method
                    </Text>
                    <View style={styles.methodRow}>
                        {(['upi', 'cash', 'bank', 'other'] as const).map((m) => (
                            <TouchableOpacity
                                key={m}
                                style={[
                                    styles.methodChip,
                                    paymentMethod === m && styles.methodChipActive,
                                    {
                                        backgroundColor: paymentMethod === m ? colors.tint : colors.surface,
                                        borderColor: paymentMethod === m ? colors.tint : colors.border
                                    }
                                ]}
                                onPress={() => setPaymentMethod(m)}
                            >
                                <Text style={[
                                    styles.methodText,
                                    { color: paymentMethod === m ? '#FFF' : colors.textSecondary }
                                ]}>
                                    {m.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Reason Input */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Note (Optional)
                    </Text>
                    <TextInput
                        style={[
                            styles.reasonInput,
                            {
                                color: colors.text,
                                borderColor: colors.border,
                                backgroundColor: colors.surface,
                            },
                        ]}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Add a note about this transaction"
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={3}
                    />
                </View>

                {/* Info Note */}
                <View
                    style={[
                        styles.infoCard,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                    ]}
                >
                    <Ionicons name="information-circle" size={20} color={colors.textSecondary} />
                    <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                        You can edit the amount, category, and note. The payee and date cannot be changed.
                    </Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
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
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
    },
    saveText: {
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: Spacing.lg,
    },
    card: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
    },
    label: {
        fontSize: FontSizes.sm,
        fontWeight: '500',
        marginBottom: Spacing.sm,
    },
    payeeText: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        marginBottom: Spacing.xs,
    },
    upiText: {
        fontSize: FontSizes.sm,
    },
    amountInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    currencySymbol: {
        fontSize: 32,
        fontWeight: '700',
        marginRight: Spacing.xs,
    },
    amountInput: {
        flex: 1,
        fontSize: 32,
        fontWeight: '700',
    },
    reasonInput: {
        borderWidth: 1,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        fontSize: FontSizes.md,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    infoCard: {
        flexDirection: 'row',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        gap: Spacing.sm,
        marginTop: Spacing.md,
    },
    infoText: {
        flex: 1,
        fontSize: FontSizes.sm,
        lineHeight: 20,
    },
    typeToggleContainer: {
        flexDirection: 'row',
        borderRadius: BorderRadius.lg,
        padding: 4,
        marginBottom: Spacing.md,
    },
    typeOption: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
    },
    typeOptionActive: {},
    typeText: {
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '600',
        fontSize: FontSizes.sm,
    },
    typeTextActive: {
        color: '#FFF',
    },
    methodRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    methodChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    methodChipActive: {
        borderColor: '#FFF',
    },
    methodText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 10,
        fontWeight: '700',
    },
    methodTextActive: {
        color: '#1E3A8A',
    },
});
