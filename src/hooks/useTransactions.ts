import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getTransactions } from '@/db/queries/transactions';
import type { TransactionFilters } from '@/db/queries/transactions';
import type { Transaction } from '@/types';

export type { TransactionFilters };

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches transactions matching the given filters.
 *
 * Filter values are all primitives so they are destructured into individual
 * useCallback dependencies — the caller's filter object reference does not
 * need to be stable.
 */
export function useTransactions(filters: TransactionFilters = {}): UseTransactionsResult {
  const db = useDatabase();

  const {
    wallet_id,
    category_id,
    type,
    year_month,
    is_tax_relevant,
    search,
    limit,
    offset,
  } = filters;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTransactions(
        await getTransactions(db, {
          wallet_id,
          category_id,
          type,
          year_month,
          is_tax_relevant,
          search,
          limit,
          offset,
        }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  // Primitive filter values are the real dependencies — not the object wrapper.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, wallet_id, category_id, type, year_month, is_tax_relevant, search, limit, offset]);

  useEffect(() => {
    load();
  }, [load]);

  return { transactions, loading, error, refetch: load };
}
