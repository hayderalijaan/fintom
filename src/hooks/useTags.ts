import { useCallback, useEffect, useState } from 'react';

import { useDatabase } from '@/context/DatabaseContext';
import { getTags } from '@/db/queries/tags';
import type { Tag } from '@/types';

interface UseTagsResult {
  tags: Tag[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useTags(): UseTagsResult {
  const db = useDatabase();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTags(await getTags(db));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  return { tags, loading, error, refetch: load };
}
