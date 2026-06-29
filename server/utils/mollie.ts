/**
 * Server-side Mollie provider wiring (Nitro / H3).
 *
 * The Nuxt mirror of propeller-vue's `src/server/mollie.js` and
 * propeller-next's `lib/mollie.ts`. Hosts a single `MollieProvider` for the
 * app's payment flow. The wiring is application-specific: we build the Propeller
 * SDK client from Nuxt's server runtimeConfig (the same `direct`-mode posture
 * `server/utils/infra.ts` uses for SSR, with the order-editor key the webhook
 * needs) and read the Mollie keys + mode from runtimeConfig.
 *
 * Used by the three `/api/mollie/*` Nitro routes:
 *   - create-payment  — start a payment at checkout.
 *   - payment-status  — live status lookup for the return page (read-only).
 *   - webhook         — reconcile order/payment state from Mollie.
 *
 * Server-only. Never imported by a client component. (Files under `server/`
 * are excluded from the client bundle by Nitro, so the Mollie keys read here
 * never leak.)
 */

import type { H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { MollieProvider } from '@propeller-commerce/propeller-v2-mollie';
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
const MOLLIE_ORDER_EDITOR_MUTATIONS = [
  // SDK defaults (must be repeated — this option replaces, not extends):
  'orderSetStatus',
  'passwordResetLink',
  'triggerQuoteSendRequest',
  'triggerOrderSendConfirm',
  // Payment mutations the Mollie flow issues, gated the same way:
  'paymentCreate',
  'paymentUpdate',
];

/**
 * Build the Propeller SDK client the Mollie flow uses. Server-to-server
 * (`direct` mode) with the order-editor key — and with the payment mutations
 * added to the order-editor set so they authenticate with that key. No bearer
 * token: these run as the server, not a logged-in user.
 *
 * Reads the same `boilerplate*` runtimeConfig keys `server/utils/infra.ts` uses
 * for its server fetches (sourced from `BOILERPLATE_GRAPHQL_ENDPOINT` /
 * `BOILERPLATE_API_KEY` / `BOILERPLATE_ORDER_EDITOR_API_KEY`).
 */
function createMollieGraphqlClient(event: H3Event): GraphQLClient {
  const config = useRuntimeConfig(event);
  return new GraphQLClient({
    endpoint: config.boilerplateGraphqlEndpoint || '',
    apiKey: config.boilerplateApiKey || '',
    orderEditorApiKey: config.boilerplateOrderEditorApiKey || '',
    securityMode: 'direct',
    timeout: 30000,
    orderEditorMutations: MOLLIE_ORDER_EDITOR_MUTATIONS,
  });
}

/**
 * Whether Mollie is the active payment provider. Gated so a shop without Mollie
 * keys keeps the previous "place order → straight to thank-you" behaviour. Set
 * `PAYMENT_PROVIDER=mollie` (server) to turn it on.
 */
export function isMollieEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event);
  return (config.paymentProvider || '').trim().toLowerCase() === 'mollie';
}

/**
 * Absolute URL Mollie POSTs webhooks to. Must be publicly reachable over HTTPS
 * (Mollie can't reach localhost/LAN IPs).
 *
 * Prefers an explicit `MOLLIE_WEBHOOK_URL` override so the webhook can point at a
 * tunnel (ngrok / cloudflared) while the shopper-facing redirect stays on the
 * normal `NUXT_PUBLIC_SITE_URL`. If the override is just an origin (no path),
 * append `/api/mollie/webhook`; if it already includes the path, use it as-is.
 * Falls back to `NUXT_PUBLIC_SITE_URL` + the route path.
 */
export function mollieWebhookUrl(event: H3Event): string {
  const config = useRuntimeConfig(event);
  const override = (config.mollieWebhookUrl || '').trim();
  if (override) {
    return /\/api\/mollie\/webhook\/?$/.test(override)
      ? override
      : `${override.replace(/\/$/, '')}/api/mollie/webhook`;
  }
  const origin = (config.public.siteUrl || '').replace(/\/$/, '');
  return `${origin}/api/mollie/webhook`;
}

/**
 * Whether a payment-method code settles "on account" (no PSP). Server-side
 * mirror of `app/utils/payments.ts` (which is client-side). Reads
 * `ON_ACCOUNT_PAYMENTS` (the server-only runtimeConfig key); defaults to
 * `REKENING,ON_ACCOUNT`. Used as a defense-in-depth guard in the create-payment
 * route.
 */
export function isOnAccountMethod(event: H3Event, method: string | undefined | null): boolean {
  if (!method) return false;
  const config = useRuntimeConfig(event);
  const raw = config.onAccountPayments || '';
  const list = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const codes = list.length > 0 ? list : ['REKENING', 'ON_ACCOUNT'];
  return codes.includes(method.trim().toUpperCase());
}

let _provider: MollieProvider | null = null;

/**
 * The shared `MollieProvider`. A module-level singleton is fine — one server
 * process, and the client is a thin HTTP wrapper. Its mutations run with the
 * server `BOILERPLATE_API_KEY` / `…_ORDER_EDITOR_API_KEY`, so no bearer token.
 *
 * Caller should guard with `isMollieEnabled(event)` first.
 */
export function getMollieProvider(event: H3Event): MollieProvider {
  if (_provider) return _provider;
  const config = useRuntimeConfig(event);
  const liveApiKey = config.mollieLiveKey || '';
  const testApiKey = config.mollieTestKey || '';
  const testMode = (config.mollieTestMode || 'true').trim().toLowerCase() === 'true';

  _provider = new MollieProvider(
    { liveApiKey, testApiKey, testMode },
    {
      // `direct`-mode client whose order-editor set includes
      // paymentCreate/paymentUpdate, so all of Mollie's mutations use the
      // order-editor key.
      client: createMollieGraphqlClient(event),
      webhookUrl: mollieWebhookUrl(event),
    },
  );
  return _provider;
}
