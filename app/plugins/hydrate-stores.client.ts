import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';

/**
 * Client-only post-hydration step. The Pinia store factory functions run
 * once on the server (storage is null → server-rendered store value is
 * null) and `__NUXT__` payload restores those null values on the client.
 * That clobbers anything the factory's setup ran on the client side from
 * localStorage. Pull those values back here.
 *
 * Order matters: hydrate after `propeller.ts` has installed the Vue UI
 * plugin so any package component that reads cart/company on first render
 * sees the localStorage state.
 */
export default defineNuxtPlugin(() => {
  const cart = useCartStore();
  const company = useCompanyStore();
  cart.hydrateFromStorage();
  company.hydrateFromStorage();
});
