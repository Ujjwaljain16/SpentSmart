import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PendingManager } from '@/services/pending-manager';
import { calculateInsights, Period, PeriodInsights } from '@/services/analytics';
import { getBudget } from '@/services/storage';
import { getUserProfile } from '@/services/user-storage';

import { BalanceCard } from '@/components/home/BalanceCard';
import { InsightsGrid } from '@/components/home/InsightsGrid';
import { FloatingScanButton } from '@/components/home/FloatingScanButton';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, FontSizes } from '@/constants/theme';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const insets = useSafeAreaInsets();

  // User profile for greeting
  const [username, setUsername] = useState<string>('');
  const [avatarId, setAvatarId] = useState<string>('');

  const [period, setPeriod] = useState<Period>('week');
  const [insights, setInsights] = useState<PeriodInsights | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      // Check for abandoned payment attempts
      const activePendings = await PendingManager.getPendings();
      if (activePendings.length > 0) {
        router.push('/recover-pending');
        return;
      }

      // Load user profile for greeting
      const profile = await getUserProfile();
      if (profile) {
        setUsername(profile.name);
        setAvatarId(profile.avatarId);
      }

      // Load insights for selected period
      const [data, budgetData] = await Promise.all([
        calculateInsights(period),
        getBudget()
      ]);
      setInsights(data);
      setBudget(budgetData);
    } catch (error) {
      console.error('Error loading insights:', error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handlePeriodChange = (newPeriod: Period) => {
    // Don't reload if clicking same period
    if (newPeriod === period) {
      return;
    }
    setPeriod(newPeriod);
    setLoading(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 120 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
            colors={[colors.tint]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : insights ? (
          <>
            {/* Greeting Header */}
            <View style={styles.greetingHeader}>
              <Text style={[styles.greeting, { color: colors.text }]}>
                hey, {username.toLowerCase() || 'there'}
              </Text>
              <View style={[styles.avatarCircle, { backgroundColor: colors.surface }]}>
                <Ionicons name={(avatarId || 'person-circle') as any} size={32} color={colors.text} />
              </View>
            </View>

            {/* Balance Card */}
            <BalanceCard
              balance={insights.balance}
              totalIncome={insights.totalIncome}
              totalExpense={insights.totalExpense}
              trend={insights.trend}
              period={period}
              budget={budget}
              onPeriodChange={handlePeriodChange}
            />

            {/* Quick Actions Row */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={[styles.quickAction, { backgroundColor: colors.card }]}
                onPress={() => router.push('/manual-entry')}
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.tint }]}>
                  <Ionicons name="send-outline" size={20} color="#FFF" />
                </View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Transfer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickAction, { backgroundColor: colors.card }]}
                onPress={() => router.push('/receive')}
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.success }]}>
                  <Ionicons name="download-outline" size={20} color="#FFF" />
                </View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Receive</Text>
              </TouchableOpacity>
            </View>

            {/* Insights Grid */}
            {insights.totalExpense > 0 ? (
              <InsightsGrid
                categoryBreakdown={insights.categoryBreakdown}
                topPayees={insights.topPayees}
              />
            ) : (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No spending data</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Scan first UPI → Auto track everything
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Unable to load data</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Pull to refresh</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Scan Button */}
      <FloatingScanButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  greetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  greeting: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: '#FFF',
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    // fontSize: 24,
  },
});
