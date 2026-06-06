import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getMonthlyFlow } from '@/db/queries/stats';
import type { MonthlyFlow } from '@/db/queries/stats';

export type { MonthlyFlow };

interface UseMonthlyFlowResult {
  data: MonthlyFlow[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useMonthlyFlow(numMonths = 6): UseMonthlyFlowResult {
  const db = useDatabase();
  const [data, setData] = useState<MonthlyFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMonthlyFlow(db, numMonths));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db, numMonths]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
