import React from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { UPIAppInfo } from '@/services/upi-app-launcher';

interface UPICarouselProps {
    apps: UPIAppInfo[];
    onSelect: (appId: string) => void;
    isLoading?: boolean;
}

export const UPICarousel: React.FC<UPICarouselProps> = ({ apps, onSelect, isLoading }) => {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'dark'];

    if (apps.length === 0) return null;

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
                Other Payment Methods
            </Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
                snapToInterval={80 + Spacing.sm}
            >
                {apps.map((app) => (
                    <TouchableOpacity
                        key={app.id}
                        style={[styles.appItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => onSelect(app.id)}
                        disabled={isLoading}
                    >
                        <View style={[styles.iconContainer, { backgroundColor: colors.background }]}>
                            <Ionicons name="wallet-outline" size={24} color={colors.tint} />
                        </View>
                        <Text style={[styles.appName, { color: colors.text }]} numberOfLines={1}>
                            {app.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: Spacing.md,
    },
    label: {
        fontSize: FontSizes.xs,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: Spacing.sm,
        marginLeft: Spacing.xs,
        letterSpacing: 0.5,
    },
    scrollContent: {
        paddingRight: Spacing.lg,
        gap: Spacing.sm,
    },
    appItem: {
        width: 80,
        height: 90,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xs,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    appName: {
        fontSize: FontSizes.xs,
        fontWeight: '500',
        textAlign: 'center',
    },
    appIcon: {
        width: 32,
        height: 32,
        resizeMode: 'contain',
    },
});
