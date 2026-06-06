import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getMonthTransferTotals } from '@/db/queries/stats';
import type { MonthTransferTotals } from '@/db/queries/stats';

export type { MonthTransferTotals };

interface UseMonthTransferTotalsResult {
  totals: MonthTransferTotals;
  refetch: () => Promise<void>;
}

export function useMonthTransferTotals(year: number, month: number): UseMonthTransferTotalsResult {
  const db = useDatabase();
  const [totals, setTotals] = useState<MonthTransferTotals>({ outgoing_cents: 0, incoming_cents: 0 });

  const load = useCallback(async () => {
    try {
      setTotals(await getMonthTransferTotals(db, year, month));
    } catch (e) {
      console.error('[useMonthTransferTotals]', e);
    }
  }, [db, year, month]);

  useEffect(() => { load(); }, [load]);

  return { totals, refetch: load };
}
