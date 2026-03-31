/**
 * Shared in-memory request cache with deduplication of in-flight requests.
 *
 * Features:
 * - Caches API responses keyed by URL + params
 * - Configurable TTL per entry
 * - Deduplicates in-flight requests (same URL returns same Promise)
 * - Manual cache invalidation via clearCache()
 * - Cache stats for monitoring hit rates
 */

// ── TTL presets (milliseconds) ──────────────────────────────────────────────

/** 60 minutes — for infrastructure data that rarely changes */
export const TTL_INFRASTRUCTURE = 60 * 60 * 1000;

/** 30 minutes — for location-specific lookups */
export const TTL_LOCATION = 30 * 60 * 1000;

/** 10 minutes — for data that may change more frequently */
export const TTL_SHORT = 10 * 60 * 1000;

// ── Cache entry ─────────────────────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

// ── Internal state ──────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

let stats = {
  hits: 0,
  misses: 0,
  deduped: 0,
  evictions: 0,
};

// ── Core API ────────────────────────────────────────────────────────────────

/**
 * Fetch with caching and in-flight deduplication.
 *
 * If a cached response exists and hasn't expired, returns it immediately.
 * If the same key is already being fetched, returns the existing Promise
 * instead of making a duplicate request.
 *
 * @param key   Unique cache key (typically URL + params)
 * @param fetcher  Async function that performs the actual request
 * @param ttl   Time-to-live in milliseconds (default: TTL_INFRASTRUCTURE)
 * @returns The cached or freshly fetched data
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = TTL_INFRASTRUCTURE,
): Promise<T> {
  // 1. Check cache
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < entry.ttl) {
    stats.hits++;
    return entry.data as T;
  }

  // Expired entry — remove it
  if (entry) {
    cache.delete(key);
    stats.evictions++;
  }

  // 2. Check in-flight deduplication
  const existing = inFlight.get(key);
  if (existing) {
    stats.deduped++;
    return existing as Promise<T>;
  }

  // 3. Execute fetcher and cache the result
  stats.misses++;
  const promise = fetcher().then(
    (data) => {
      cache.set(key, { data, timestamp: Date.now(), ttl });
      inFlight.delete(key);
      return data;
    },
    (err) => {
      // Don't cache failures — remove in-flight tracker and re-throw
      inFlight.delete(key);
      throw err;
    },
  );

  inFlight.set(key, promise);
  return promise;
}

// ── Cache management ────────────────────────────────────────────────────────

/** Clear all cached entries and in-flight trackers. */
export function clearCache(): void {
  cache.clear();
  inFlight.clear();
}

/** Clear cached entries matching a key prefix. */
export function clearCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/** Get current cache statistics. */
export function getCacheStats(): {
  hits: number;
  misses: number;
  deduped: number;
  evictions: number;
  size: number;
  inFlight: number;
  hitRate: number;
} {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    size: cache.size,
    inFlight: inFlight.size,
    hitRate: total > 0 ? Math.round((stats.hits / total) * 100) : 0,
  };
}

/** Reset cache statistics counters. */
export function resetCacheStats(): void {
  stats = { hits: 0, misses: 0, deduped: 0, evictions: 0 };
}
