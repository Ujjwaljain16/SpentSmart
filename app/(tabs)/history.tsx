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
import { DEFAULT_CATEGORIES } from '@/services/category-storage';
import { useSecurity } from '@/contexts/security-context';

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year';

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { isPrivacyModeEnabled } = useSecurity();
  const insets = useSafeAreaInsets();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'all'>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<DateFilter>('all');
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);

  const loadTransactions = useCallback(async () => {
    try {
      let results: Transaction[];

      if (searchQuery.trim()) {
        results = await searchTransactions(searchQuery);
      } else {
        results = await getAllTransactions();
      }

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
      console.error('Error loading transactions:', error);
    }
  }, [searchQuery, selectedCategory, selectedDateRange]);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [loadTransactions])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
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
            loadTransactions();
          },
        },
      ]
    );
  };

  const handleEdit = (transaction: Transaction) => {
    // Navigate to edit screen with transaction data
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
    <View style={[styles.emptyState, { backgroundColor: 'transparent' }]}>
      <Ionicons
        name={searchQuery ? 'search-outline' : 'receipt-outline'}
        size={48}
        color="rgba(255, 255, 255, 0.5)"
      />
      <Text style={[styles.emptyText, { color: 'rgba(255, 255, 255, 0.9)' }]}>
        {searchQuery ? 'No matching transactions' : 'No transactions yet'}
      </Text>
      <Text style={[styles.emptySubtext, { color: 'rgba(255, 255, 255, 0.6)' }]}>
        {searchQuery
          ? 'Try a different search term'
          : 'Your payment history will appear here'}
      </Text>
    </View>
  );

  const totalAmount = transactions.reduce((sum, tx) => {
    return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
  }, 0);

  // Match home/charts background
  const backgroundColor = colorScheme === 'dark' ? '#1E3A8A' : '#3B82F6';

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.md,
            backgroundColor: 'transparent',
          },
        ]}
      >
        <Text style={[styles.title, { color: '#FFF' }]}>History</Text>

        {/* Search Bar */}
        <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
          ]}
        >
          <Ionicons
            name="search"
            size={20}
            color="rgba(255, 255, 255, 0.7)"
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, { color: '#FFF' }]}
            placeholder="Search by reason, payee, category..."
            placeholderTextColor="rgba(255, 255, 255, 0.5)"
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
                color="rgba(255, 255, 255, 0.7)"
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => {
              const categories: (CategoryType | 'all')[] = ['all', 'food', 'utility', 'college', 'rent', 'other'];
              const currentIndex = categories.indexOf(selectedCategory);
              const nextIndex = (currentIndex + 1) % categories.length;
              setSelectedCategory(categories[nextIndex]);
            }}
          >
            <Text style={styles.filterText}>
              {selectedCategory === 'all' ? 'All Categories' : DEFAULT_CATEGORIES.find(c => c.key === selectedCategory)?.label || 'Other'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="rgba(255, 255, 255, 0.7)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => {
              const ranges: DateFilter[] = ['all', 'today', 'week', 'month', 'year'];
              const currentIndex = ranges.indexOf(selectedDateRange);
              const nextIndex = (currentIndex + 1) % ranges.length;
              setSelectedDateRange(ranges[nextIndex]);
            }}
          >
            <Text style={styles.filterText}>
              {selectedDateRange === 'all' ? 'All Time' :
                selectedDateRange === 'today' ? 'Today' :
                  selectedDateRange === 'week' ? 'This Week' :
                    selectedDateRange === 'month' ? 'This Month' : 'This Year'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="rgba(255, 255, 255, 0.7)" />
          </TouchableOpacity>
        </View>

        {/* Summary */}
        {transactions.length > 0 && (
          <View style={styles.summary}>
            <Text style={[styles.summaryText, { color: 'rgba(255, 255, 255, 0.7)' }]}>
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} •{' '}
              <Text style={{ color: '#FFF', fontWeight: '600' }}>
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
            tintColor="#FFF"
            colors={['#3B82F6']}
            progressBackgroundColor="#FFF"
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
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
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filterText: {
    color: 'rgba(255, 255, 255, 0.9)',
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

