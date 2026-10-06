import { usePriceStore } from '~/stores/price';

/**
 * SSR-only — seed the price store from the `price_include_tax` cookie before
 * anything renders.
 *
 * The store's factory reads `document.cookie`, which does not exist on the
 * server, so SSR always rendered the incl-VAT default. That state ships in the
 * `__NUXT__` payload and Pinia's hydration replaces whatever the client factory
 * read, so an excl-VAT choice was lost on every reload.
 *
 * Runs for guests too — the toggle needs no login. Mirrors
 * `entry-server.ts` in propeller-vue, which seeds the same store from the
 * request cookies.
 */
export default defineNuxtPlugin({
  name: 'seed-price',
  dependsOn: ['pinia'],
  setup() {
    const raw = useCookie<string | undefined>('price_include_tax').value;
    usePriceStore(usePinia()).seedFromCookie(
      raw === undefined ? {} : { price_include_tax: raw },
    );
  },
});
