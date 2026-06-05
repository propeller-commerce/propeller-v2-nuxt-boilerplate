import { computed, type ComputedRef } from 'vue';
import { useLanguageStore } from '~/stores/language';

/**
 * Package-namespaced translations composable. Mirrors propeller-vue's
 * `useTranslations(namespace)` API — returns a ComputedRef of label keys
 * for the given namespace, reactive to the active language.
 *
 * The package's components accept this object via their `:labels` prop. For
 * now the provider returns an empty record per namespace, which makes the
 * package fall back to its own English defaults. Real namespace dictionaries
 * live in the propeller-vue repo (`src/locales/{en,nl}/<Component>.json`) and
 * can be copied verbatim into `app/locales/` here when needed.
 */
export function useTranslations(_namespace: string): ComputedRef<Record<string, string>> {
  const languageStore = useLanguageStore();
  return computed(() => {
    // Keying on languageStore.language so the computed re-evaluates on
    // language switch — when the dictionary backend lands, change the
    // body to look up `_namespace` against `language` and return the map.
    void languageStore.language;
    return {} as Record<string, string>;
  });
}
