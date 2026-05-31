import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getGoals } from '@/db/queries/goals';
import type { Goal } from '@/types';

interface UseGoalsResult {
  goals: Goal[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useGoals(): UseGoalsResult {
  const db = useDatabase();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGoals(await getGoals(db));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  return { goals, loading, error, refetch: load };
}
