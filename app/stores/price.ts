import { defineStore } from 'pinia';
import { ref } from 'vue';
import { isBrowser, setBrowserCookie } from '~/utils/ssr';

const COOKIE_NAME = 'price_include_tax';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readClientCookie(): boolean {
  if (typeof document === 'undefined') return true;
  const match = document.cookie.match(/(?:^|;\s*)price_include_tax=([^;]+)/);
  if (!match) return true;
  return match[1] === '1';
}

export const usePriceStore = defineStore('price', () => {
  const includeTax = ref(readClientCookie());

  function setIncludeTax(value: boolean) {
    includeTax.value = value;
    if (isBrowser) {
      setBrowserCookie(COOKIE_NAME, value ? '1' : '0', COOKIE_MAX_AGE_SECONDS);
      window.dispatchEvent(new CustomEvent('priceToggleChanged', { detail: value }));
    }
  }

  function toggleTax() {
    setIncludeTax(!includeTax.value);
  }

  /**
   * Server-only: seed from request cookies so SSR + first client render agree.
   */
  function seedFromCookie(cookies: Record<string, string>) {
    const raw = cookies[COOKIE_NAME];
    includeTax.value = raw === undefined ? true : raw === '1';
  }

  return { includeTax, setIncludeTax, toggleTax, seedFromCookie };
});
