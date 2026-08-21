import { GraphQLClient, type GraphQLClientConfig } from '@propeller-commerce/propeller-sdk-v2';
import { propellerVue, createServices } from '@propeller-commerce/propeller-v2-vue-ui';
import { configuration } from '~/utils/config';

/**
 * Tier 1 plugin — installs propeller-v2-vue-ui's `propellerVue` plugin with
 * graphqlClient + services + currency + configuration. Runs on both server
 * and client (Nuxt's plugin scope is per-request on the server, so each
 * request gets its own GraphQLClient — no cross-request auth leakage).
 *
 * On the server the client targets `BOILERPLATE_GRAPHQL_ENDPOINT` directly
 * (server-only env, never reaches the bundle). On the client it targets
 * `/api/graphql` (the proxy injects apikey server-side).
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig();

  const endpoint = import.meta.server
    ? config.boilerplateGraphqlEndpoint
    : config.public.graphqlEndpoint;

  // Two postures share the same factory:
  //   - server: direct mode with the real apikey (env-derived, never bundled).
  //   - client: proxy mode against /api/graphql; the Nitro handler injects
  //     the apikey upstream. NEVER ship apikeys to the browser — passing
  //     even an empty string triggers the SDK's "keys ignored in proxy
  //     mode" warning, so omit the fields entirely on the client branch.
  const clientConfig: GraphQLClientConfig = import.meta.server
    ? {
        endpoint,
        apiKey: config.boilerplateApiKey,
        orderEditorApiKey: config.boilerplateOrderEditorApiKey,
        securityMode: 'direct',
        timeout: 30000,
        headers: {},
      }
    : {
        endpoint,
        securityMode: 'proxy',
        timeout: 30000,
        headers: {},
      };

  const graphqlClient = new GraphQLClient(clientConfig);
  const services = createServices(graphqlClient);

  // The channel's anonymous user: resolved once during SSR (only the server
  // can reach the channel) and carried to the browser in the Nuxt payload, so
  // client-side listing queries scope exactly as the SSR seed did. Same route
  // the catalog root takes — no module guesses it.
  const anonymousUserId = useState<number | undefined>('propeller:anonymousUserId');
  if (import.meta.server && anonymousUserId.value === undefined) {
    try {
      const defaults = await $fetch('/api/catalog/channel-defaults');
      anonymousUserId.value = defaults.anonymousUserId;
    } catch {
      // Non-fatal: without it, logged-out client queries fall back to the
      // api key's own scope, which is the behaviour that predates this.
    }
  }

  nuxtApp.vueApp.use(propellerVue, {
    graphqlClient,
    services,
    currency: config.public.currency,
    configuration: {
      ...configuration,
      get anonymousUserId() {
        return anonymousUserId.value;
      },
    },
  });

  return {
    provide: {
      graphqlClient,
      services,
    },
  };
});
