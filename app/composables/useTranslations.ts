import { computed, type ComputedRef } from 'vue';
import { useLanguageStore } from '~/stores/language';
import { getTranslationProvider } from '~/lib/i18n';

/**
 * Read a namespace's translated strings, reactive to the current language.
 *
 * Returns a ComputedRef so language switches re-evaluate and rebind the
 * `:labels` prop. The underlying getNamespace() call is sync; the
 * ComputedRef is the Vue-side reactivity wrapper (equivalent to React's
 * Context update path in propeller-next).
 *
 * Works in SSR because useLanguageStore() returns the request-scoped Pinia
 * store the seed-auth.server.ts (and middleware/language.global.ts) plugins
 * populate before any view setup runs.
 *
 * Mirrors propeller-vue/src/lib/i18n/composable.ts line-for-line — keep
 * the two implementations in sync so changes flow in either direction
 * with minimal diff.
 */
export function useTranslations(
  namespace: string,
): ComputedRef<Record<string, string>> {
  const languageStore = useLanguageStore();
  return computed(() => {
    const locale = languageStore.language.toLowerCase();
    return getTranslationProvider().getNamespace(locale, namespace);
  });
}
