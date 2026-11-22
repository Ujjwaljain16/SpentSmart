import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticTab } from '@/components/haptic-tab';
import { useThemeColors } from '@/hooks/use-theme-colors';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: readonly { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline' },
  { name: 'history', title: 'Activity', icon: 'list-outline' },
  { name: 'budgets', title: 'Budgets', icon: 'pie-chart-outline' },
  { name: 'charts', title: 'Insights', icon: 'bar-chart-outline' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline' },
];

export default function TabLayout() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarShowLabel: false,
          tabBarButton: HapticTab,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            height: 60 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 10,
          },
          tabBarBackground: () =>
            // expo-blur doesn't blur on Android, so a translucent tint there lets the list show through the icons.
            Platform.OS === 'ios' ? (
              <BlurView
                intensity={25}
                tint={colors.isDark ? 'dark' : 'light'}
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
                    borderTopColor: colors.border,
                  },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.background,
                    borderTopColor: colors.border,
                  },
                ]}
              />
            ),
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.title,
              tabBarIcon: ({ color }) => <Ionicons name={tab.icon} size={28} color={color} />,
            }}
          />
        ))}
      </Tabs>
      {/* The status bar is transparent; without a backdrop, scrolled content runs under the clock and icons. */}
      <View pointerEvents="none" style={[styles.statusBar, { height: insets.top, backgroundColor: colors.background }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { ...StyleSheet.absoluteFillObject, borderTopWidth: 1 },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0 },
});
