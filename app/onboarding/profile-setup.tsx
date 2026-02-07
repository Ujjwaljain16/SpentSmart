import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BorderRadius, Colors, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { completeOnboardingWithProfile } from '@/services/user-storage';

// Avatar options - emoji animals
const AVATAR_OPTIONS = ['🐱', '🐶', '🐭', '🐹', '🐰', '🐻', '🐼', '🐨', '🐯'];

export default function ProfileSetupScreen() {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const [username, setUsername] = useState('');
    const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isFormValid = username.trim().length >= 2 && selectedAvatarId !== null;

    const handleContinue = async () => {
        if (!isFormValid) return;

        const trimmedUsername = username.trim();
        if (trimmedUsername.length < 2) {
            Alert.alert('Name too short', 'Please enter at least 2 characters.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Save profile and mark onboarding complete
            await completeOnboardingWithProfile({
                name: trimmedUsername,
                avatarId: selectedAvatarId!,
            });

            // Reset navigation to main app
            router.replace('/(tabs)');
        } catch (error) {
            console.error('Error completing onboarding:', error);
            Alert.alert('Error', 'Failed to save your information. Please try again.');
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.emoji]}>👋</Text>
                        <Text style={[styles.title, { color: colors.text }]}>
                            What should we call you?
                        </Text>
                        <Text style={[styles.subtext, { color: colors.textSecondary }]}>
                            Let's personalize your experience
                        </Text>
                    </View>

                    {/* Name input */}
                    <View style={styles.inputSection}>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: colors.card,
                                    borderColor: colors.border,
                                    color: colors.text,
                                },
                            ]}
                            placeholder="Your name"
                            placeholderTextColor={colors.textSecondary}
                            value={username}
                            onChangeText={setUsername}
                            autoFocus
                            maxLength={50}
                        />
                    </View>

                    {/* Avatar section */}
                    <View style={styles.avatarSection}>
                        <Text style={[styles.avatarLabel, { color: colors.text }]}>Pick your vibe</Text>
                        <View style={styles.avatarGrid}>
                            {AVATAR_OPTIONS.map((avatarId) => (
                                <TouchableOpacity
                                    key={avatarId}
                                    style={[
                                        styles.avatarCard,
                                        {
                                            backgroundColor: colors.card,
                                            borderColor:
                                                selectedAvatarId === avatarId ? colors.tint : colors.border,
                                            borderWidth: selectedAvatarId === avatarId ? 3 : 1,
                                        },
                                    ]}
                                    onPress={() => setSelectedAvatarId(avatarId)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.avatarEmoji}>{avatarId}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Bottom padding for fixed button */}
                    <View style={{ height: 100 }} />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Primary CTA - Fixed at bottom */}
            <View style={[styles.buttonContainer, { backgroundColor: colors.background }]}>
                <TouchableOpacity
                    style={[
                        styles.button,
                        {
                            backgroundColor: colors.tint,
                            opacity: isFormValid && !isSubmitting ? 1 : 0.5,
                        },
                    ]}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                    disabled={!isFormValid || isSubmitting}
                >
                    <Text style={styles.buttonText}>
                        {isSubmitting ? 'Saving...' : 'Continue'}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xl,
    },
    header: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
        marginTop: Spacing.lg,
    },
    emoji: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    title: {
        fontSize: FontSizes.xxl,
        fontWeight: '600',
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    subtext: {
        fontSize: FontSizes.sm,
        textAlign: 'center',
        paddingHorizontal: Spacing.xl,
    },
    inputSection: {
        marginBottom: Spacing.xl,
    },
    input: {
        width: '100%',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        fontSize: FontSizes.md,
        textAlign: 'center',
    },
    avatarSection: {
        marginBottom: Spacing.xl,
    },
    avatarLabel: {
        fontSize: FontSizes.md,
        fontWeight: '500',
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    avatarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    avatarCard: {
        width: 70,
        height: 70,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarEmoji: {
        fontSize: 32,
    },
    buttonContainer: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        paddingBottom: Spacing.lg,
    },
    button: {
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        fontSize: FontSizes.lg,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
