import { defineStore } from 'pinia';
import { ref } from 'vue';
import { isBrowser, safeStorage } from '~/utils/ssr';

const STORAGE_KEY = 'preferred_language';

export const useLanguageStore = defineStore('language', () => {
  const runtimeConfig = useRuntimeConfig();
  // Was inferred from the currency (`EUR ? 'NL' : 'EN'`), which ignored the
  // configured default language entirely — a euro shop set to English still
  // opened in Dutch.
  const DEFAULT_LANGUAGE = String(runtimeConfig.public.defaultLanguage || 'NL').toUpperCase();

  const language = ref(safeStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE);

  function setLanguage(lang: string) {
    const upper = lang.toUpperCase();
    if (language.value === upper) return;
    language.value = upper;
    safeStorage.setItem(STORAGE_KEY, upper);
    if (isBrowser) {
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: upper }));
    }
  }

  if (isBrowser) {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        language.value = e.newValue;
      }
    });
  }

  return { language, setLanguage };
});
