import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_CATEGORIES, resolveCategory } from '@/domain/categories';
import { Category } from '@/domain/types';
import { subscribeToDataChanges } from '@/db/events';
import { log } from '@/lib/logger';
import { useRepos } from './database-context';

interface CategoriesContextType {
  categories: readonly Category[];
  /** Resolve a key to a category; unknown keys resolve to "Other". */
  resolve: (key: string) => Category;
}

const CategoriesContext = createContext<CategoriesContextType | null>(null);

/** One shared, always-fresh category list for the whole app (replaces a storage read per list row). */
export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const repos = useRepos();
  const [categories, setCategories] = useState<readonly Category[]>(DEFAULT_CATEGORIES);

  const refresh = useCallback(async () => {
    try {
      setCategories(await repos.categories.list());
    } catch (error) {
      log.warn('Failed to load categories', error);
    }
  }, [repos]);

  useEffect(() => {
    void refresh();
    return subscribeToDataChanges(() => void refresh());
  }, [refresh]);

  const value = useMemo<CategoriesContextType>(
    () => ({ categories, resolve: (key) => resolveCategory(categories, key) }),
    [categories],
  );
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories(): CategoriesContextType {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used inside <CategoriesProvider>');
  return ctx;
}
