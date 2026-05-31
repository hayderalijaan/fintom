import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getCategories } from '@/db/queries/categories';
import type { Category, CategoryType } from '@/types';

interface UseCategoriesResult {
  categories: Category[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Returns active categories. Pass a `type` to filter to only income or expense
 * categories — useful for category pickers that are type-specific.
 */
export function useCategories(type?: CategoryType): UseCategoriesResult {
  const db = useDatabase();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCategories(await getCategories(db, type));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db, type]);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, loading, error, refetch: load };
}
