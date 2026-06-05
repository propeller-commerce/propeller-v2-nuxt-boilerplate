/**
 * Cache-tag scheme — single source of truth shared between the cached
 * fetchers and the `/api/revalidate` webhook. Mirrors propeller-next's
 * `lib/server.ts` constants byte-for-byte so the same backend webhook
 * contract works against both apps.
 *
 * Never inline tag strings elsewhere. Call `tagFor('product', 42)`.
 */

export const ANONYMOUS_CACHE_TTL_SECONDS = 300;
export const TAG_CATALOG = 'catalog';

export type CacheableEntity = 'product' | 'category' | 'cluster' | 'menu' | 'search';

export function tagFor(entity: CacheableEntity, id?: number | string): string {
  return id === undefined ? entity : `${entity}:${id}`;
}
