import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getAllWalletsWithBalances } from '@/db/queries/wallets';
import type { WalletWithBalance } from '@/db/queries/wallets';

export type { WalletWithBalance };

interface UseWalletsResult {
  wallets: WalletWithBalance[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useWallets(): UseWalletsResult {
  const db = useDatabase();
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWallets(await getAllWalletsWithBalances(db));
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

  return { wallets, loading, error, refetch: load };
}
