import { GraphQLClient } from '@propeller-commerce/propeller-sdk-v2';
import type { Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';
import { createServices, toPlain } from 'propeller-v2-vue-ui/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * SSR-only — seed the auth store from the `access_token` cookie BEFORE
 * `<PropellerProvider>` renders, so the server-emitted HTML reflects the
 * logged-in user and the `__NUXT__` payload carries the resolved viewer
 * across the SSR/client boundary.
 *
 * Without this plugin the auth store's factory runs server-side with
 * `safeStorage` returning null on every read, the serialised null state
 * ships in the payload, and Pinia's hydration step replaces whatever the
 * client-side factory had read from localStorage with that null. Result:
 * a logged-in user who refreshes the page momentarily renders as
 * anonymous until the next navigation re-hydrates the store from
 * localStorage.
 *
 * Cost: one extra `services.user.getViewer({})` per authenticated SSR
 * navigation. Bypassed entirely when no `access_token` cookie is present.
 *
 * Plugin ordering: this MUST run AFTER `@pinia/nuxt` installs Pinia onto
 * the app, otherwise `useAuthStore()` throws "getActivePinia() was called
 * with no active Pinia" and the SSR pass dies with an unhandled rejection.
 * `dependsOn: ['pinia']` pins the order declaratively. Do NOT add
 * `enforce: 'pre'` — that races against Pinia's installer.
 *
 * Note: inlines the GraphQLClient construction instead of importing from
 * `~~/server/utils/infra.ts`. That file pulls `nitropack/runtime` aliases
 * which only resolve inside the Nitro runtime context — importing it
 * from a Nuxt server plugin throws ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
export default defineNuxtPlugin({
  name: 'seed-auth',
  dependsOn: ['pinia'],
  async setup() {
    const token = useCookie('access_token').value;
    if (!token) return;

    const config = useRuntimeConfig();
    const endpoint = config.boilerplateGraphqlEndpoint;
    if (!endpoint) return;

    try {
      const client = new GraphQLClient({
        endpoint,
        apiKey: config.boilerplateApiKey,
        orderEditorApiKey: config.boilerplateOrderEditorApiKey,
        securityMode: 'direct',
        timeout: 30000,
        headers: { Authorization: `Bearer ${token}` },
      });
      const services = createServices(client);
      const viewer = await services.user.getViewer({});
      if (!viewer) return;
      const plain = toPlain(viewer) as Contact | Customer;
      const auth = useAuthStore();
      auth.hydrateFromServer(plain, token);
    } catch (e) {
      console.error('[seed-auth] failed to resolve viewer:', e);
    }
  },
});
