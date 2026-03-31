import { useCallback, useState } from 'react';
import { lookupInfrastructure, type InfraResult } from '../lib/infraLookup';
import { parseCoordinates } from '../utils/parseCoordinates';

interface UseInfraLookupReturn {
  loading: boolean;
  error: string | null;
  lookup: (opts: { address?: string; coordinates?: string }) => Promise<InfraResult | null>;
}

export function useInfraLookup(): UseInfraLookupReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(
    async (opts: { address?: string; coordinates?: string }): Promise<InfraResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const coords = opts.coordinates ? parseCoordinates(opts.coordinates) : null;
        const result = await lookupInfrastructure({
          coordinates: coords ?? undefined,
          address: opts.address || undefined,
        });
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lookup failed');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, lookup };
}
