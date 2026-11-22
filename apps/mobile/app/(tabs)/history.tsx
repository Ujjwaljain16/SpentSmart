import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { TransactionCard } from '@/components/transactions/transaction-card';
import { Button } from '@/components/ui/Button';
import { ChoiceChips, FieldLabel, TextField } from '@/components/ui/form';
import { useFormatMoney } from '@/components/ui/Money';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useRepos } from '@/contexts/database-context';
import { DateFilter, dateFilterStart } from '@spentsmart/finance/periods';
import { Category, Transaction } from '@spentsmart/finance/types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useLiveQuery } from '@/hooks/use-live-query';
import { usePagedTransactions } from '@/hooks/use-paged-transactions';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { parseAmountRange } from '@/lib/amount-range';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';

const DATE_FILTERS: readonly DateFilter[] = ['all', 'today', 'week', 'month', 'year'];
const DATE_LABELS: Record<DateFilter, string> = { all: 'All time', today: 'Today', week: 'This week', month: 'This month', year: 'This year' };
const ALL_KEY = 'all';

export default function HistoryScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const format = useFormatMoney();
  const { categories } = useCategories();

  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText, 250);
  const [categoryKey, setCategoryKey] = useState<string>(ALL_KEY);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [accountId, setAccountId] = useState<string>(ALL_KEY);
  const [tag, setTag] = useState<string>(ALL_KEY);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const range = parseAmountRange(useDebouncedValue(minText, 400), useDebouncedValue(maxText, 400));

  const { data: accounts } = useLiveQuery((r) => r.accounts.list());
  const { data: tags } = useLiveQuery((r) => r.transactions.tags());
  const accountOptions = useMemo(() => [{ value: ALL_KEY, label: 'All accounts' }, ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))], [accounts]);
  const tagOptions = useMemo(() => [{ value: ALL_KEY, label: 'Any tag' }, ...(tags ?? []).map((t) => ({ value: t, label: `#${t}` }))], [tags]);

  const filter = useMemo(
    () => ({
      search,
      categoryKey: categoryKey === ALL_KEY ? undefined : categoryKey,
      accountId: accountId === ALL_KEY ? undefined : accountId,
      tag: tag === ALL_KEY ? undefined : tag,
      minPaise: range.minPaise,
      maxPaise: range.maxPaise,
      since: dateFilterStart(dateFilter, new Date()),
    }),
    // `since` is derived from "now"; recomputing per filter change is intended.
    [search, categoryKey, accountId, tag, range.minPaise, range.maxPaise, dateFilter],
  );
  const { items, summary, loading, loadingMore, hasMore, loadMore, reload } = usePagedTransactions(filter);

  const pickerCategories = useMemo<readonly Category[]>(
    () => [{ key: ALL_KEY, label: 'All categories', icon: 'apps', color: colors.text, sortOrder: -1, isSystem: true }, ...categories],
    [categories, colors.text],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('Delete transaction', 'Are you sure you want to delete this transaction?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            repos.transactions.remove(id).catch((error) => {
              log.error('Delete failed', error);
              Alert.alert('Error', 'The transaction could not be deleted.');
            });
          },
        },
      ]);
    },
    [repos],
  );

  const handleEdit = useCallback((t: Transaction) => router.push(routes.editTransaction(t.id)), []);

  const cycleDateFilter = () => setDateFilter(DATE_FILTERS[(DATE_FILTERS.indexOf(dateFilter) + 1) % DATE_FILTERS.length]!);

  const moreCount = (accountId !== ALL_KEY ? 1 : 0) + (tag !== ALL_KEY ? 1 : 0) + (minText.trim() || maxText.trim() ? 1 : 0);
  const isFiltered = searchText.trim() !== '' || categoryKey !== ALL_KEY || dateFilter !== 'all' || moreCount > 0;
  const clearMore = () => {
    setAccountId(ALL_KEY);
    setTag(ALL_KEY);
    setMinText('');
    setMaxText('');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          Activity
        </Text>

        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            accessibilityLabel="Search transactions"
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by note, payee, category…"
            placeholderTextColor={colors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchText('')} style={styles.clear}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          <View style={styles.flex}>
            <CategoryPicker selectedCategory={categoryKey} onSelectCategory={setCategoryKey} mode="dropdown" categories={pickerCategories} />
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Date filter: ${DATE_LABELS[dateFilter]}. Tap to change`}
            style={[styles.dateButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={cycleDateFilter}
          >
            <Text style={[styles.dateText, { color: colors.text }]}>{DATE_LABELS[dateFilter]}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={moreCount > 0 ? `More filters, ${moreCount} on` : 'More filters'}
            accessibilityState={{ expanded: showMore }}
            style={[styles.moreButton, { backgroundColor: moreCount > 0 ? colors.tint : colors.card, borderColor: moreCount > 0 ? colors.tint : colors.border }]}
            onPress={() => setShowMore((v) => !v)}
          >
            <Ionicons name="options-outline" size={20} color={moreCount > 0 ? colors.onTint : colors.text} />
            {moreCount > 0 ? <Text style={[styles.moreCount, { color: colors.onTint }]}>{moreCount}</Text> : null}
          </TouchableOpacity>
        </View>

        {showMore && (
          <View style={[styles.morePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FieldLabel>Account</FieldLabel>
            <ChoiceChips label="Account" options={accountOptions} value={accountId} onChange={setAccountId} />
            <FieldLabel>Amount (₹)</FieldLabel>
            <View style={styles.rangeRow}>
              <TextField accessibilityLabel="Minimum amount" placeholder="Min" keyboardType="decimal-pad" value={minText} onChangeText={setMinText} style={styles.flex} />
              <Text style={{ color: colors.textSecondary }}>to</Text>
              <TextField accessibilityLabel="Maximum amount" placeholder="Max" keyboardType="decimal-pad" value={maxText} onChangeText={setMaxText} style={styles.flex} />
            </View>
            {range.invalid ? <Text style={[styles.rangeError, { color: colors.error }]}>Enter amounts like 100 or 2500</Text> : null}
            {tagOptions.length > 1 ? (
              <>
                <FieldLabel>Tag</FieldLabel>
                <ChoiceChips label="Tag" options={tagOptions} value={tag} onChange={setTag} />
              </>
            ) : null}
            {moreCount > 0 ? <Button label="Clear these filters" variant="ghost" onPress={clearMore} /> : null}
          </View>
        )}

        {summary && summary.count > 0 && (
          <Text style={[styles.summary, { color: colors.textSecondary }]}>
            {summary.count} transaction{summary.count === 1 ? '' : 's'} • net{' '}
            <Text style={{ color: colors.text, fontWeight: '600' }}>{format(Math.abs(summary.netPaise), { sign: summary.netPaise < 0 ? '-' : undefined })}</Text>
          </Text>
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionCard transaction={item} onDelete={handleDelete} onEdit={handleEdit} />}
        contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} colors={[colors.tint]} progressBackgroundColor={colors.card} />}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.6}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={colors.tint} /> : <View style={styles.bottomSpace} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Ionicons name={isFiltered ? 'search-outline' : 'receipt-outline'} size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.text }]}>{isFiltered ? 'No matching transactions' : 'No transactions yet'}</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{isFiltered ? 'Try a different search or filter' : 'Your payment history will appear here'}</Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, zIndex: 100 },
  title: { fontSize: FontSizes.xxl, fontWeight: '700', marginBottom: Spacing.md },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: { flex: 1, minHeight: 48, fontSize: FontSizes.md },
  clear: { padding: Spacing.sm },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  dateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, minHeight: 44 },
  dateText: { fontSize: FontSizes.sm, fontWeight: '500' },
  moreButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, minHeight: 44, minWidth: 48, justifyContent: 'center' },
  moreCount: { fontSize: FontSizes.sm, fontWeight: '700' },
  morePanel: { marginTop: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.xs },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rangeError: { fontSize: FontSizes.xs },
  summary: { fontSize: FontSizes.sm, paddingTop: Spacing.sm },
  list: { padding: Spacing.lg, paddingTop: Spacing.md },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  footer: { paddingVertical: Spacing.lg },
  bottomSpace: { height: 100 },
  emptyState: { padding: Spacing.xl, borderRadius: BorderRadius.lg, alignItems: 'center' },
  emptyText: { fontSize: FontSizes.md, fontWeight: '500', marginTop: Spacing.md, marginBottom: Spacing.xs },
  emptySub: { fontSize: FontSizes.sm, textAlign: 'center' },
});
