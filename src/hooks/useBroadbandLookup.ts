import { useCallback, useState } from 'react';
import { lookupBroadband } from '../lib/broadbandLookup';
import type { BroadbandResult } from '../types';
import { parseCoordinates } from '../utils/parseCoordinates';

interface UseBroadbandLookupReturn {
  loading: boolean;
  error: string | null;
  result: BroadbandResult | null;
  lookup: (opts: { address?: string; coordinates?: string }) => Promise<BroadbandResult | null>;
  clear: () => void;
}

export function useBroadbandLookup(): UseBroadbandLookupReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BroadbandResult | null>(null);

  const lookup = useCallback(
    async (opts: { address?: string; coordinates?: string }): Promise<BroadbandResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const coords = opts.coordinates ? parseCoordinates(opts.coordinates) : null;
        const res = await lookupBroadband({
          coordinates: coords ?? undefined,
          address: opts.address || undefined,
        });
        setResult(res);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Broadband lookup failed';
        setError(msg);
        setResult(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { loading, error, result, lookup, clear };
}
