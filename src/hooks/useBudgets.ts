import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getBudgetVsActual, getCarryForward } from '@/db/queries/budgets';
import type { BudgetVsActual } from '@/db/queries/budgets';

export type { BudgetVsActual };

interface UseBudgetsResult {
  /** Budget planned vs actual spend, one row per active expense category. */
  budgetRows: BudgetVsActual[];
  /** Net income minus expenses for the month (positive = surplus). */
  carryForward: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useBudgets(year: number, month: number): UseBudgetsResult {
  const db = useDatabase();
  const [budgetRows, setBudgetRows] = useState<BudgetVsActual[]>([]);
  const [carryForward, setCarryForward] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, cf] = await Promise.all([
        getBudgetVsActual(db, year, month),
        getCarryForward(db, year, month),
      ]);
      setBudgetRows(rows);
      setCarryForward(cf);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  return { budgetRows, carryForward, loading, error, refetch: load };
}
