/**
 * Anonymous fetch cache with custom per-entity tag invalidation.
 *
 * Nitro 2's `defineCachedFunction` keys on argument hash and has no per-tag
 * invalidation hook, so we hand-roll a `tag → cacheKey[]` inverted index in
 * `useStorage('cache')` and walk it at bust time. The `cachedSdkFetch`
 * wrapper makes the bypass-when-authenticated path explicit and works across
 * any Nitro storage driver (fs in dev, redis in prod) without code change.
 *
 * Worked example — an anonymous category 13 fetch (sort=NAME, page=1):
 *   cacheKey = 'sdk:category:13:lang=nl:sort=NAME:page=1:offset=12'
 *   Writes:
 *     setItem(cacheKey, payload, { ttl: 300 })
 *     setItem('tag:catalog',     [...prev, cacheKey])
 *     setItem('tag:category',    [...prev, cacheKey])
 *     setItem('tag:category:13', [...prev, cacheKey])
 *
 * Bust by tag — POST /api/revalidate { tag: 'category:13' } → walks the tag
 * index, removes every referenced cache entry.
 */

import { useStorage } from 'nitropack/runtime';
import { ANONYMOUS_CACHE_TTL_SECONDS } from './tags';

export interface CachedFetchInput<T> {
  /** Stable cache key — must be deterministic for the same SDK input. */
  key: string;
  /** Tags to attach so a future bust can reach this entry. */
  tags: readonly string[];
  /** TTL in seconds. Defaults to ANONYMOUS_CACHE_TTL_SECONDS (300). */
  ttl?: number;
  /**
   * When true, skip the cache entirely and call `fetcher()` directly. Set by
   * `getServerInfra()` for authenticated renders — the cookie read has
   * already opted the route into dynamic rendering.
   */
  bypass: boolean;
  /** The underlying SDK call. Always called on cache miss or bypass. */
  fetcher: () => Promise<T>;
}

export async function cachedSdkFetch<T>(input: CachedFetchInput<T>): Promise<T> {
  if (input.bypass) return input.fetcher();

  const storage = useStorage('cache');

  const cached = (await storage.getItem<T>(input.key)) as T | null;
  if (cached !== null && cached !== undefined) return cached;

  const fresh = await input.fetcher();
  await storage.setItem(input.key, fresh as unknown as Record<string, unknown>, {
    ttl: input.ttl ?? ANONYMOUS_CACHE_TTL_SECONDS,
  });

  // Tag-index bookkeeping. Idempotent dedup (`includes`) prevents most
  // duplicate appends; cross-request concurrent writes can still race, but
  // the impact is bounded (a duplicate entry, or one missed bust that
  // expires via TTL within minutes).
  await Promise.all(
    input.tags.map(async (tag) => {
      const indexKey = `tag:${tag}`;
      const prev = ((await storage.getItem<string[]>(indexKey)) as string[] | null) ?? [];
      if (!prev.includes(input.key)) {
        await storage.setItem(indexKey, [...prev, input.key] as unknown as Record<string, unknown>);
      }
    })
  );

  return fresh;
}

/**
 * Invalidate every cache entry tagged with `tag`. Returns the number of
 * entries cleared. Called by `/api/revalidate` (secret-gated webhook).
 */
export async function bustTag(tag: string): Promise<number> {
  const storage = useStorage('cache');
  const indexKey = `tag:${tag}`;
  const keys = ((await storage.getItem<string[]>(indexKey)) as string[] | null) ?? [];
  await Promise.all(keys.map((k) => storage.removeItem(k)));
  await storage.removeItem(indexKey);
  return keys.length;
}

/**
 * Deterministic JSON stringify — sorts object keys so the same SDK input
 * always produces the same cache key regardless of construction order. The
 * variable-order discipline `lib/server.ts` documents in propeller-next is
 * replaced by this single helper here.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
