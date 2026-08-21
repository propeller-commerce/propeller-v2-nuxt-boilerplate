import { detectLanguageFromPath } from '~/utils/config';
import { useLanguageStore } from '~/stores/language';

/**
 * Sync the language store with the URL's language prefix before any page
 * renders. Mirrors propeller-vue's router `beforeEach` guard.
 *
 * Runs both server and client — on the server it primes the store so the
 * SSR render happens in the URL-derived language; on the client it keeps
 * the store aligned across navigations.
 */
export default defineNuxtRouteMiddleware((to) => {
  const target = detectLanguageFromPath(to.path);
  // Resolve the store against the app's Pinia instance explicitly. A global
  // route middleware can run before Pinia is the *active* instance for the
  // request (there's no `dependsOn: ['pinia']` equivalent for middleware), so
  // a bare `useLanguageStore()` throws "getActivePinia() was called but there
  // was no active Pinia" on the first SSR navigation. Passing `usePinia()`
  // (provided by @pinia/nuxt) binds the store to the right instance regardless
  // of middleware/plugin ordering.
  const store = useLanguageStore(usePinia());
  if (store.language !== target) {
    store.setLanguage(target);
  }
});
