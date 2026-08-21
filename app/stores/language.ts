import { defineStore } from 'pinia';
import { ref } from 'vue';
import { isBrowser, safeStorage } from '~/utils/ssr';

const STORAGE_KEY = 'preferred_language';

export const useLanguageStore = defineStore('language', () => {
  const runtimeConfig = useRuntimeConfig();
  const DEFAULT_LANGUAGE = (runtimeConfig.public.currencyCode === 'EUR' ? 'NL' : 'EN').toUpperCase();

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
