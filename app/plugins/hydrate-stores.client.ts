import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { safeStorage } from '~/utils/ssr';

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
 *
 * Auth fallback: `seed-auth.server.ts` populates the store from the
 * httpOnly cookie at SSR time. When that succeeds, this fallback is a
 * no-op (the store already has the user). When SSR seeding skipped (no
 * cookie, viewer fetch failed, or a static page rendered the layout
 * anonymously), we re-read localStorage so the header / account guard
 * see the logged-in user immediately instead of waiting for the next
 * navigation. The full profile lives in `localStorage['user']`; the
 * Bearer token is in `accessToken`.
 */
export default defineNuxtPlugin(() => {
  const cart = useCartStore();
  const company = useCompanyStore();
  cart.hydrateFromStorage();
  company.hydrateFromStorage();

  const auth = useAuthStore();
  if (!auth.user || !auth.token) {
    try {
      const storedUser = safeStorage.getItem('user');
      const storedToken = safeStorage.getItem('accessToken');
      if (storedUser && storedToken) {
        auth.hydrateFromServer(JSON.parse(storedUser), storedToken);
      }
    } catch {
      /* malformed storage — ignore */
    }
  }
});
