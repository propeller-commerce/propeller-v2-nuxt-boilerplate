/**
 * Server-side MultiSafepay provider wiring (Nitro / H3).
 *
 * The Nuxt mirror of propeller-vue's `src/server/msp.js` and propeller-next's
 * `lib/msp.ts`, and the MultiSafepay sibling of `server/utils/mollie.ts`. Hosts a
 * single `MspProvider` for the app's payment flow. The wiring is
 * application-specific: we build the Propeller SDK client from Nuxt's server
 * runtimeConfig (the same `direct`-mode posture `server/utils/infra.ts` uses for
 * SSR, with the order-editor key the webhook needs) and read the MultiSafepay
 * keys + mode from runtimeConfig.
 *
 * Used by the `/api/msp/*` Nitro routes:
 *   - create-payment  — start a payment at checkout.
 *   - payment-status  — live status lookup for the return page (read-only).
 *   - webhook         — reconcile order/payment state from MultiSafepay.
 *
 * `isOnAccountMethod` is provider-agnostic and lives in `./mollie`; the MSP
 * create-payment route reuses that export rather than duplicating it.
 *
 * Server-only. Never imported by a client component. (Files under `server/` are
 * excluded from the client bundle by Nitro, so the MSP keys read here never
 * leak.)
 */

import type { H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { MspProvider } from '@propeller-commerce/propeller-v2-msp';
import { GraphQLClient } from '@propeller-commerce/propeller-sdk-v2';

/**
 * Mutations the backend gates behind the order-editor API key. In `direct` mode
 * the SDK routes these to `orderEditorApiKey` instead of `apiKey`.
 *
 * The SDK's built-in list (orderSetStatus, passwordResetLink,
 * triggerQuoteSendRequest, triggerOrderSendConfirm) does NOT include the payment
 * mutations, but our backend requires the order-editor key for them too —
 * otherwise `paymentCreate`/`paymentUpdate` 403 with "Forbidden resource".
 * `orderEditorMutations` REPLACES the default list, so we include the defaults
 * plus the payment mutations.
 */
const MSP_ORDER_EDITOR_MUTATIONS = [
  // SDK defaults (must be repeated — this option replaces, not extends):
  'orderSetStatus',
  'passwordResetLink',
  'triggerQuoteSendRequest',
  'triggerOrderSendConfirm',
  // Payment mutations the MultiSafepay flow issues, gated the same way:
  'paymentCreate',
  'paymentUpdate',
];

/**
 * Build the Propeller SDK client the MultiSafepay flow uses. Server-to-server
 * (`direct` mode) with the order-editor key — and with the payment mutations
 * added to the order-editor set so they authenticate with that key. No bearer
 * token: these run as the server, not a logged-in user.
 *
 * Reads the same `boilerplate*` runtimeConfig keys `server/utils/mollie.ts` uses
 * (sourced from `BOILERPLATE_GRAPHQL_ENDPOINT` / `BOILERPLATE_API_KEY` /
 * `BOILERPLATE_ORDER_EDITOR_API_KEY`).
 */
function createMspGraphqlClient(event: H3Event): GraphQLClient {
  const config = useRuntimeConfig(event);
  return new GraphQLClient({
    endpoint: config.boilerplateGraphqlEndpoint || '',
    apiKey: config.boilerplateApiKey || '',
    orderEditorApiKey: config.boilerplateOrderEditorApiKey || '',
    securityMode: 'direct',
    timeout: 30000,
    orderEditorMutations: MSP_ORDER_EDITOR_MUTATIONS,
  });
}

/**
 * Whether MultiSafepay is the active payment provider. Gated so a shop without
 * MSP keys keeps the previous "place order → straight to thank-you" behaviour.
 * Set `PAYMENT_PROVIDER=multisafepay` (server) to turn it on. Only one PSP is
 * active at a time (this and `isMollieEnabled` are mutually exclusive).
 */
export function isMspEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event);
  return (config.paymentProvider || '').trim().toLowerCase() === 'multisafepay';
}

/**
 * Absolute URL MultiSafepay POSTs notifications to. Must be publicly reachable
 * over HTTPS (MultiSafepay can't reach localhost/LAN IPs).
 *
 * Prefers an explicit `MSP_WEBHOOK_URL` override so the webhook can point at a
 * tunnel (cloudflared / ngrok) while the shopper-facing redirect stays on the
 * normal `NUXT_PUBLIC_SITE_URL`. If the override is just an origin (no path),
 * append `/api/msp/webhook`; if it already includes the path, use it as-is.
 * Falls back to `NUXT_PUBLIC_SITE_URL` + the route path.
 */
export function mspWebhookUrl(event: H3Event): string {
  const config = useRuntimeConfig(event);
  const override = (config.mspWebhookUrl || '').trim();
  if (override) {
    return /\/api\/msp\/webhook\/?$/.test(override)
      ? override
      : `${override.replace(/\/$/, '')}/api/msp/webhook`;
  }
  const origin = (config.public.siteUrl || '').replace(/\/$/, '');
  return `${origin}/api/msp/webhook`;
}

let _provider: MspProvider | null = null;

/**
 * The shared `MspProvider`. A module-level singleton is fine — one server
 * process, and the client is a thin HTTP wrapper. Its mutations run with the
 * server `BOILERPLATE_API_KEY` / `…_ORDER_EDITOR_API_KEY`, so no bearer token.
 *
 * Caller should guard with `isMspEnabled(event)` first.
 */
export function getMspProvider(event: H3Event): MspProvider {
  if (_provider) return _provider;
  const config = useRuntimeConfig(event);
  const liveApiKey = config.mspLiveKey || '';
  const testApiKey = config.mspTestKey || '';
  const testMode = (config.mspTestMode || 'true').trim().toLowerCase() === 'true';
  const locale = (config.mspLocale || '').trim();

  _provider = new MspProvider(
    { liveApiKey, testApiKey, testMode, ...(locale ? { locale } : {}) },
    {
      // `direct`-mode client whose order-editor set includes
      // paymentCreate/paymentUpdate, so all of MultiSafepay's mutations use the
      // order-editor key.
      client: createMspGraphqlClient(event),
      webhookUrl: mspWebhookUrl(event),
    },
  );
  return _provider;
}
