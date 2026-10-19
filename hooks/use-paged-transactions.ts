import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useRepos } from '@/contexts/database-context';
import { subscribeToDataChanges } from '@/db/events';
import { FilterSummary, TransactionCursor, TransactionFilter } from '@/db/repositories/transactions';
import { Transaction } from '@/domain/types';
import { log } from '@/lib/logger';

const PAGE_SIZE = 40;

export interface PagedTransactions {
  items: Transaction[];
  summary: FilterSummary | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => Promise<void>;
}

/**
 * Infinite list over the transactions table. Loads one page at a time (keyset pagination), so opening
 * History costs the same with 100 or 100,000 transactions.
 */
export function usePagedTransactions(filter: TransactionFilter): PagedTransactions {
  const repos = useRepos();
  const [items, setItems] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FilterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<TransactionCursor | null>(null);
  const sequence = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const reload = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const [page, sum] = await Promise.all([
        repos.transactions.list(filterRef.current, PAGE_SIZE),
        repos.transactions.summarize(filterRef.current),
      ]);
      if (id !== sequence.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setSummary(sum);
    } catch (error) {
      log.error('Failed to load transactions', error);
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [repos]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    const id = sequence.current;
    setLoadingMore(true);
    repos.transactions
      .list(filterRef.current, PAGE_SIZE, cursor)
      .then((page) => {
        if (id !== sequence.current) return;
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch((error) => log.error('Failed to load more transactions', error))
      .finally(() => setLoadingMore(false));
  }, [repos, cursor, loadingMore]);

  const { search, categoryKey, type, since, until } = filter;
  useFocusEffect(
    useCallback(() => {
      void reload();
      const unsubscribe = subscribeToDataChanges(() => void reload());
      return () => {
        unsubscribe();
        sequence.current++;
      };
    }, [reload, search, categoryKey, type, since, until]),
  );

  return { items, summary, loading, loadingMore, hasMore: cursor !== null, loadMore, reload };
}
