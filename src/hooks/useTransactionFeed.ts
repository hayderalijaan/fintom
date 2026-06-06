import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getTransactionFeed, parseFeedTags } from '@/db/queries/transactions';
import type { TransactionFeedRow, TransactionFilters } from '@/db/queries/transactions';

export type { TransactionFeedRow };
export { parseFeedTags };

interface UseTransactionFeedResult {
  rows: TransactionFeedRow[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useTransactionFeed(filters: TransactionFilters = {}): UseTransactionFeedResult {
  const db = useDatabase();
  const {
    wallet_id, category_id, type, year_month,
    is_tax_relevant, search, limit, offset,
  } = filters;

  const [rows, setRows] = useState<TransactionFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getTransactionFeed(db, {
        wallet_id, category_id, type, year_month,
        is_tax_relevant, search, limit, offset,
      }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db, wallet_id, category_id, type, year_month, is_tax_relevant, search, limit, offset]);

  useEffect(() => { load(); }, [load]);

  return { rows, loading, error, refetch: load };
}
