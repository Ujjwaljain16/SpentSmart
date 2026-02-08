import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState, useCallback } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { BorderRadius, Colors, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getUserProfile, saveUserProfile } from '@/services/user-storage';

// Avatar options - Ionicons names
const AVATAR_OPTIONS = ['person', 'happy', 'star', 'heart', 'paw', 'leaf', 'rocket', 'shield', 'flash'];

export default function EditProfileScreen() {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];
    const insets = useSafeAreaInsets();

    const [username, setUsername] = useState('');
    const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const loadProfile = useCallback(async () => {
        try {
            const profile = await getUserProfile();
            if (profile) {
                setUsername(profile.name);
                setSelectedAvatarId(profile.avatarId);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadProfile();
        }, [loadProfile])
    );

    const isFormValid = username.trim().length >= 2 && selectedAvatarId !== null;

    const handleSave = async () => {
        if (!isFormValid) return;

        const trimmedUsername = username.trim();
        if (trimmedUsername.length < 2) {
            Alert.alert('Name too short', 'Please enter at least 2 characters.');
            return;
        }

        setIsSubmitting(true);
        try {
            await saveUserProfile({
                name: trimmedUsername,
                avatarId: selectedAvatarId!,
            });

            Alert.alert('Success', 'Profile updated successfully', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error('Error saving profile:', error);
            Alert.alert('Error', 'Failed to save changes. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

            {/* Header with Back Button */}
            <View
                style={[
                    styles.header,
                    {
                        paddingTop: insets.top + Spacing.sm,
                        backgroundColor: colors.background,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                    },
                ]}
            >
                <TouchableOpacity onPress={() => router.back()} style={[styles.headerButton, { backgroundColor: colors.card, borderRadius: 20 }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
                <View style={[styles.headerButton, { backgroundColor: 'transparent' }]} />
            </View>

            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Welcome Text */}
                    <View style={styles.introSection}>
                        <View style={{ marginBottom: Spacing.sm }}>
                            <Ionicons name="sparkles" size={48} color={colors.text} />
                        </View>
                        <Text style={[styles.title, { color: colors.text }]}>
                            Update your look
                        </Text>
                    </View>

                    {/* Name input */}
                    <View style={styles.inputSection}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Display Name</Text>
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
                            maxLength={50}
                        />
                    </View>

                    {/* Avatar section */}
                    <View style={styles.avatarSection}>
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Choose Avatar</Text>
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
                                        selectedAvatarId === avatarId && {
                                            shadowColor: colors.tint,
                                            shadowOffset: { width: 0, height: 4 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 8,
                                            elevation: 4,
                                        }
                                    ]}
                                    onPress={() => setSelectedAvatarId(avatarId)}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name={avatarId as any} size={32} color={colors.text} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={{ height: 100 }} />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Save Button */}
            <View style={[styles.buttonContainer, { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <TouchableOpacity
                    style={[
                        styles.button,
                        {
                            backgroundColor: colors.tint,
                            opacity: isFormValid && !isSubmitting ? 1 : 0.5,
                        },
                    ]}
                    onPress={handleSave}
                    activeOpacity={0.8}
                    disabled={!isFormValid || isSubmitting}
                >
                    <Text style={styles.buttonText}>
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </Text>
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
        paddingBottom: Spacing.md,
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
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        padding: Spacing.lg,
    },
    introSection: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    emoji: {
        marginBottom: Spacing.sm,
    },
    title: {
        fontSize: FontSizes.xl,
        fontWeight: '600',
        textAlign: 'center',
    },
    sectionLabel: {
        fontSize: FontSizes.md,
        fontWeight: '600',
        marginBottom: Spacing.md,
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
    },
    avatarSection: {
        marginBottom: Spacing.xl,
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
    },
    buttonContainer: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.lg,
        paddingBottom: 40, // More padding for bottom safe area
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
