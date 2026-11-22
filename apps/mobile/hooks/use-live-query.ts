import { useFocusEffect } from 'expo-router';
import { DependencyList, useCallback, useRef, useState } from 'react';
import { useRepos } from '@/contexts/database-context';
import { subscribeToDataChanges } from '@/db/events';
import { Repositories } from '@/db/repositories';
import { log } from '@/lib/logger';

export interface LiveQuery<T> {
  data: T | undefined;
  /** True until the first result (or error) arrives. */
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

/**
 * Run a repository query while the screen is focused, and re-run it whenever the underlying data changes.
 * Out-of-order results are discarded, so a slow earlier query can never overwrite a newer one.
 */
export function useLiveQuery<T>(query: (repos: Repositories) => Promise<T>, deps: DependencyList = []): LiveQuery<T> {
  const repos = useRepos();
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: unknown }>({ loading: true });
  const sequence = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  const run = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const data = await queryRef.current(repos);
      if (id === sequence.current) setState({ data, loading: false });
    } catch (error) {
      log.error('Query failed', error);
      if (id === sequence.current) setState((s) => ({ ...s, loading: false, error }));
    }
  }, [repos]);

  useFocusEffect(
    useCallback(() => {
      void run();
      const unsubscribe = subscribeToDataChanges(() => void run());
      return () => {
        unsubscribe();
        sequence.current++; // drop in-flight results once the screen loses focus
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, ...deps]),
  );

  return { data: state.data, loading: state.loading, error: state.error, refresh: run };
}
