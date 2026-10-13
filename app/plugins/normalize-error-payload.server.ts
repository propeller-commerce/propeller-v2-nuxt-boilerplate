/**
 * SSR-only — give `payload.error` a prototype before devalue serialises it.
 *
 * Nuxt builds the SSR error from `getQuery(event)` on `/__nuxt_error`, which
 * returns a null-prototype object. Pinia 2.3.1's skipHydrate reducer runs
 * `obj.hasOwnProperty(skipHydrateSymbol)` while walking the payload, and
 * `isPlainObject` accepts a null-prototype object because its toString tag is
 * still `[object Object]` — so the call throws `obj.hasOwnProperty is not a
 * function`, the render dies and every 404 degrades to a 500.
 *
 * Fixed upstream in pinia 3 (`Object.prototype.hasOwnProperty.call`), which we
 * cannot take yet: `@pinia/nuxt@0.6.1` depends on `pinia@^2.2.5`. Re-assigning
 * the object through a spread restores the prototype and leaves the values
 * untouched. Remove this once pinia 3 lands.
 */
export default defineNuxtPlugin({
  name: 'normalize-error-payload',
  enforce: 'post',
  setup(nuxtApp) {
    nuxtApp.hook('app:rendered', ({ ssrContext }) => {
      const payload = ssrContext?.payload as { error?: unknown } | undefined;
      const error = payload?.error;
      if (!payload || !error || typeof error !== 'object') return;
      if (Object.getPrototypeOf(error) !== null) return;
      payload.error = { ...(error as Record<string, unknown>) };
    });
  },
});
