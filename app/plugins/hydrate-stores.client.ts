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
export default defineNuxtPlugin({
  name: 'hydrate-stores',
  // Must run AFTER Pinia is installed — otherwise `useCartStore()` below throws
  // "getActivePinia() was called but there was no active Pinia". `dependsOn`
  // alone proved unreliable here (the client plugin still ordered ahead of
  // @pinia/nuxt's plugin on a cold dev start, surfacing a 500 + hydration
  // mismatch). Belt-and-braces: keep `dependsOn` AND resolve every store
  // against the app's Pinia instance explicitly via `useXxxStore(usePinia())`,
  // exactly like `middleware/language.global.ts`. Passing the instance binds
  // the store regardless of plugin ordering, sidestepping active-instance
  // timing entirely. `usePinia` is an auto-import from @pinia/nuxt.
  dependsOn: ['pinia'],
  setup() {
    const pinia = usePinia();
    const cart = useCartStore(pinia);
    const company = useCompanyStore(pinia);
    cart.hydrateFromStorage();
    company.hydrateFromStorage();

    const auth = useAuthStore(pinia);
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
  },
});
