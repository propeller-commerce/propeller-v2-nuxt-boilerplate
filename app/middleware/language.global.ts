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
  const store = useLanguageStore();
  if (store.language !== target) {
    store.setLanguage(target);
  }
});
