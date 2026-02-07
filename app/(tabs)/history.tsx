import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { Transaction, CategoryType } from '@/types/transaction';
import { TransactionCard } from '@/components/transactions/transaction-card';
import {
  getAllTransactions,
  searchTransactions,
  deleteTransaction,
} from '@/services/storage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DEFAULT_CATEGORIES, getCategories } from '@/services/category-storage';
import { useSecurity } from '@/contexts/security-context';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { CategoryInfo } from '@/types/transaction';

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year';

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { isPrivacyModeEnabled } = useSecurity();
  const insets = useSafeAreaInsets();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>(DEFAULT_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'all'>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<DateFilter>('all');

  const loadData = useCallback(async () => {
    try {
      const [txResults, catResults] = await Promise.all([
        searchQuery.trim() ? searchTransactions(searchQuery) : getAllTransactions(),
        getCategories()
      ]);

      setCategories(catResults);

      let results = txResults;

      // Apply category filter
      if (selectedCategory !== 'all') {
        results = results.filter(tx => tx.category === selectedCategory);
      }

      // Apply date range filter
      if (selectedDateRange !== 'all') {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

        results = results.filter(tx => {
          switch (selectedDateRange) {
            case 'today':
              return tx.timestamp >= startOfToday;
            case 'week':
              return tx.timestamp >= startOfWeek;
            case 'month':
              return tx.timestamp >= startOfMonth;
            case 'year':
              return tx.timestamp >= startOfYear;
            default:
              return true;
          }
        });
      }

      setTransactions(results);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }, [searchQuery, selectedCategory, selectedDateRange]);

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

  const handleSearch = (text: string) => {
    setSearchQuery(text);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(id);
            loadData();
          },
        },
      ]
    );
  };

  const handleEdit = (transaction: Transaction) => {
    const { router } = require('expo-router');
    router.push({
      pathname: '/edit-transaction',
      params: {
        id: transaction.id,
        amount: transaction.amount.toString(),
        category: transaction.category,
        reason: transaction.reason || '',
        payeeName: transaction.payeeName,
        upiId: transaction.upiId,
        type: transaction.type,
        paymentMethod: transaction.paymentMethod,
      },
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TransactionCard
      transaction={item}
      onDelete={handleDelete}
      onEdit={handleEdit}
      showDeleteButton
      showEditButton
    />
  );

  const renderEmptyState = () => (
    <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
      <Ionicons
        name={searchQuery ? 'search-outline' : 'receipt-outline'}
        size={48}
        color={colors.textSecondary}
      />
      <Text style={[styles.emptyText, { color: colors.text }]}>
        {searchQuery ? 'No matching transactions' : 'No transactions yet'}
      </Text>
      <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
        {searchQuery
          ? 'Try a different search term'
          : 'Your payment history will appear here'}
      </Text>
    </View>
  );

  const totalAmount = transactions.reduce((sum, tx) => {
    return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
  }, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.md,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>History</Text>

        {/* Search Bar */}
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons
            name="search"
            size={20}
            color={colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by reason, payee, category..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
              <Ionicons
                name="close-circle"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <CategoryPicker
              selectedCategory={selectedCategory}
              onSelectCategory={(category) => setSelectedCategory(category)}
              mode="dropdown"
              compact
              customCategories={[
                { key: 'all', label: 'All Categories', icon: 'apps', color: colors.text } as CategoryInfo,
                ...categories
              ]}
            />
          </View>

          <TouchableOpacity
            style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              const ranges: DateFilter[] = ['all', 'today', 'week', 'month', 'year'];
              const currentIndex = ranges.indexOf(selectedDateRange);
              const nextIndex = (currentIndex + 1) % ranges.length;
              setSelectedDateRange(ranges[nextIndex]);
            }}
          >
            <Text style={[styles.filterText, { color: colors.text }]}>
              {selectedDateRange === 'all' ? 'All Time' :
                selectedDateRange === 'today' ? 'Today' :
                  selectedDateRange === 'week' ? 'This Week' :
                    selectedDateRange === 'month' ? 'This Month' : 'This Year'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Summary */}
        {transactions.length > 0 && (
          <View style={styles.summary}>
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} •{' '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {isPrivacyModeEnabled ? '•••••' : `₹${totalAmount.toLocaleString('en-IN')}`}
              </Text>
            </Text>
          </View>
        )}
      </View>

      {/* Transaction List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        contentContainerStyle={[
          styles.listContent,
          transactions.length === 0 && styles.emptyListContent,
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
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
  },
  clearButton: {
    padding: Spacing.xs,
  },
  summary: {
    paddingTop: Spacing.sm,
  },
  summaryText: {
    fontSize: FontSizes.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    zIndex: 100, // Ensure dropdown appears above list
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filterText: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  listContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  emptySubtext: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
});
