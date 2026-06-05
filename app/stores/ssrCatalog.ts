import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * SSR catalog seed store — port of propeller-vue's `ssrCatalog`.
 *
 * In Nuxt this is mostly a redundancy backup for `useAsyncData`: the
 * `__NUXT__` payload already carries server-resolved page data and
 * hydrates the first client render with no re-fetch. This store stays
 * useful for views that want explicit "peek during hydration, consume
 * after mount" semantics across language switches.
 */
export type CatalogSeed =
  | { kind: 'product'; data: unknown }
  | { kind: 'category'; data: unknown }
  | { kind: 'search'; term: string; data: unknown }
  | { kind: 'cluster'; data: unknown };

export const useSsrCatalogStore = defineStore('ssrCatalog', () => {
  const seeds = ref<Record<string, CatalogSeed>>({});

  function setSeed(path: string, seed: CatalogSeed): void {
    seeds.value[path] = seed;
  }

  function peekSeed(path: string): CatalogSeed | null {
    return seeds.value[path] ?? null;
  }

  function consumeSeed(path: string): void {
    if (seeds.value[path]) {
      const next = { ...seeds.value };
      delete next[path];
      seeds.value = next;
    }
  }

  return { seeds, setSeed, peekSeed, consumeSeed };
});
