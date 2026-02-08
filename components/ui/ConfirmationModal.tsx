import React from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ConfirmationModalProps {
    visible: boolean;
    amount: string;
    payeeName: string;
    note?: string; // Add note prop
    confidenceScore: number;
    onConfirm: () => void;
    onCancel: () => void;
    onMaybe: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    visible,
    amount,
    payeeName,
    note,
    confidenceScore,
    onConfirm,
    onCancel,
    onMaybe
}) => {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const isDark = colorScheme === 'dark';

    // Determine color and mood based on confidence
    let moodColor = colors.tint;
    let iconName: keyof typeof Ionicons.glyphMap = 'checkmark-circle';

    if (confidenceScore < 40) {
        moodColor = colors.error;
        iconName = 'alert-circle';
    } else if (confidenceScore < 70) {
        moodColor = '#F59E0B'; // Amber
        iconName = 'help-circle';
    }

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onMaybe}
        >
            <View style={styles.centeredView}>
                <BlurView
                    intensity={isDark ? 50 : 80}
                    tint={isDark ? 'dark' : 'light'}
                    style={StyleSheet.absoluteFill}
                />

                <View style={[styles.modalView, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.iconContainer, { backgroundColor: moodColor + '20' }]}>
                        <Ionicons name={iconName} size={32} color={moodColor} />
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>
                        Payment Status
                    </Text>

                    <Text style={[styles.message, { color: colors.textSecondary }]}>
                        Did you pay <Text style={{ fontWeight: '700', color: colors.text }}>₹{amount}</Text> to {payeeName}?
                    </Text>

                    {note ? (
                        <View style={[styles.noteContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>Note:</Text>
                            <Text style={[styles.noteText, { color: colors.text }]} numberOfLines={2}>
                                "{note}"
                            </Text>
                        </View>
                    ) : null}



                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.tint }]}
                            onPress={onConfirm}
                        >
                            <Text style={styles.buttonText}>Yes, Paid</Text>
                        </TouchableOpacity>

                        <View style={styles.secondaryButtons}>
                            <TouchableOpacity
                                style={[styles.smallButton, { borderColor: colors.border }]}
                                onPress={onMaybe}
                            >
                                <Text style={[styles.smallButtonText, { color: colors.text }]}>Not Sure</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.smallButton, { borderColor: colors.border }]}
                                onPress={onCancel}
                            >
                                <Text style={[styles.smallButtonText, { color: colors.error }]}>Cancelled</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    modalView: {
        width: '85%',
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 5,
        },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    title: {
        fontSize: FontSizes.lg,
        fontWeight: '700',
        marginBottom: Spacing.xs,
        color: '#FFF',
    },
    message: {
        fontSize: FontSizes.md,
        textAlign: 'center',
        marginBottom: Spacing.md,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    confidenceBadge: {
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: BorderRadius.full,
        marginBottom: Spacing.xl,
    },
    confidenceText: {
        fontSize: FontSizes.xs,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    buttonContainer: {
        width: '100%',
        gap: Spacing.md,
    },
    secondaryButtons: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    button: {
        width: '100%',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: FontSizes.md,
        fontWeight: '600',
    },
    smallButton: {
        flex: 1,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    smallButtonText: {
        fontSize: FontSizes.sm,
        fontWeight: '500',
    },
    noteContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        marginBottom: Spacing.lg,
        gap: Spacing.sm,
        maxWidth: '100%',
    },
    noteLabel: {
        fontSize: FontSizes.sm,
        fontWeight: '600',
    },
    noteText: {
        fontSize: FontSizes.md,
        fontStyle: 'italic',
        flex: 1,
    },
});
