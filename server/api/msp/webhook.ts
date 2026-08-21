/**
 * GET/POST /api/msp/webhook — MultiSafepay notification.
 *
 * MultiSafepay calls this URL with `?transactionid=<orderId>` whenever an order
 * changes state (default method is POST; GET is also supported). We hand the id
 * to the provider, which re-fetches the order from MultiSafepay (the body is
 * never trusted — only the id matters), classifies it, and updates the Propeller
 * payment + order. ALWAYS returns 200 (`'OK'`) so MultiSafepay never retry-storms.
 *
 * The Nitro mirror of propeller-vue's Express `/api/msp/webhook` and
 * propeller-next's app/api/msp/webhook route. Differs from the Mollie webhook:
 * MSP reads the id from the QUERY string (not a form body) and answers on both
 * GET and POST — so this is a single method-agnostic file (`webhook.ts`, no
 * `.post`/`.get` suffix) rather than a POST-only handler.
 *
 * This route must be publicly reachable (MultiSafepay can't reach localhost —
 * use a tunnel like cloudflared in dev). The URL is built by `mspWebhookUrl()`
 * and handed to MultiSafepay at order-create time as `notification_url`.
 */

import { getMspProvider, isMspEnabled } from '../../utils/msp';

export default defineEventHandler(async (event) => {
  // Even when disabled we 200 — a stray delivery shouldn't look like an outage.
  if (!isMspEnabled(event)) {
    setResponseStatus(event, 200);
    return 'OK';
  }

  // MultiSafepay puts the id in the query string (`?transactionid=<orderId>`).
  const q = getQuery(event);
  const id = String(q.transactionid || q.orderId || '').trim();

  try {
    const result = await getMspProvider(event).handleWebhook(id);
    if (!result.ok) {
      console.warn('[msp] webhook not processed:', result.error, 'order:', id);
    }
  } catch (e) {
    // The provider already swallows; this guards the wiring itself.
    console.error('[msp] webhook handler error:', e instanceof Error ? e.message : e);
  }

  // Unconditionally acknowledge.
  setResponseStatus(event, 200);
  return 'OK';
});
