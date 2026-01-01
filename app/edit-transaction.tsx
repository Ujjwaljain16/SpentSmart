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

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
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
                <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
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
                {/* Payee Info (Read-only) */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Payee
                    </Text>
                    <Text style={[styles.payeeText, { color: colors.text }]}>
                        {params.payeeName}
                    </Text>
                    <Text style={[styles.upiText, { color: colors.textSecondary }]}>
                        {params.upiId}
                    </Text>
                </View>

                {/* Amount Input */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
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
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Category *
                    </Text>
                    <CategoryPicker
                        selectedCategory={category}
                        onSelectCategory={setCategory}
                    />
                </View>

                {/* Reason Input */}
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Note (Optional)
                    </Text>
                    <TextInput
                        style={[
                            styles.reasonInput,
                            {
                                color: colors.text,
                                borderColor: colors.border,
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
                        { backgroundColor: `${colors.tint}10` },
                    ]}
                >
                    <Ionicons name="information-circle" size={20} color={colors.tint} />
                    <Text style={[styles.infoText, { color: colors.text }]}>
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
        borderBottomWidth: 1,
    },
    headerButton: {
        width: 60,
        height: 40,
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
});
