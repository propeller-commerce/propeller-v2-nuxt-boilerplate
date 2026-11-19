/**
 * GET/POST /api/msp/webhook — MultiSafepay notification.
 *
 * MultiSafepay calls this URL with `?transactionid=<orderId>` whenever an order
 * changes state (default method is POST; GET is also supported). We hand the id
 * to the provider, which re-fetches the order from MultiSafepay (the body is
 * never trusted — only the id matters), classifies it, and updates the Propeller
 * payment + order. Answers 200 (`'OK'`) so MultiSafepay never retry-storms.
 *
 * Signatures (#19): MultiSafepay signs POST notifications (`Auth` header, HMAC
 * of the raw body with the API key). A POST with a missing or wrong signature,
 * or whose signed body names another order than `transactionid`, is refused
 * (403) and not processed. GET notifications carry no signature (orders created
 * by propeller-v2-msp <= 0.1.3 still use them), so anyone can send one for any
 * order id: they are limited per IP and per order (429; MultiSafepay retries
 * later) and run the provider only while the order is still UNFINISHED. A paid
 * or otherwise processed order is acknowledged and left alone, so a forged GET
 * can't re-mail the customer, clear the cart or reset the back-office status.
 * See handleMspNotification in server/utils/payment.ts.
 *
 * The Nitro mirror of propeller-vue's Express `/api/msp/webhook` and
 * propeller-next's app/api/msp/webhook route. MSP reads the id from the QUERY
 * string (not a form body) and answers on both GET and POST — so this is a
 * single method-agnostic file (`webhook.ts`, no `.post`/`.get` suffix).
 *
 * This route must be publicly reachable (MultiSafepay can't reach localhost —
 * use a tunnel like cloudflared in dev). The URL is built by `mspWebhookUrl()`
 * and handed to MultiSafepay at order-create time as `notification_url`.
 */

import { verifyWebhookSignature } from '@propeller-commerce/propeller-v2-msp';
import { getMspProvider, isMspEnabled } from '../../utils/msp';
import { createRateLimiter } from '../../utils/rateLimit';
import { errorSummary } from '../../utils/httpGuards';
import { fetchPayableOrder } from '../../utils/paymentAccess';
import { handleMspNotification } from '../../utils/payment';
import { requestClientIp } from '../../utils/requestAuth';

// Unsigned notifications per IP and per order. Its own limiter, so a flood of made-up keys can't
// evict the form limits.
const unsignedLimiter = createRateLimiter();

export default defineEventHandler(async (event) => {
  // Even when disabled we 200 — a stray delivery shouldn't look like an outage.
  if (!isMspEnabled(event)) {
    setResponseStatus(event, 200);
    return 'OK';
  }

  // MultiSafepay puts the id in the query string (`?transactionid=<orderId>`).
  const q = getQuery(event);
  const id = String(q.transactionid || q.orderId || '').trim();
  // The transaction id is the Propeller order id.
  if (!/^\d{1,15}$/.test(id)) {
    setResponseStatus(event, 200);
    return 'OK';
  }

  try {
    let signed = false;
    let body = '';
    if (event.method === 'POST') {
      const config = useRuntimeConfig(event);
      const testMode = String(config.mspTestMode ?? 'true').trim().toLowerCase() === 'true';
      const apiKey = String((testMode ? config.mspTestKey : config.mspLiveKey) || '');
      // The signature covers the exact raw body.
      body = (await readRawBody(event, 'utf8')) || '';
      signed = verifyWebhookSignature(body, getHeader(event, 'auth') || '', apiKey);
    }
    const answer = await handleMspNotification(
      { method: event.method, id, ip: requestClientIp(event), signed, body },
      {
        limiter: unsignedLimiter,
        fetchOrder: (orderId) => fetchPayableOrder(event, orderId),
        provider: () => getMspProvider(event),
      },
    );
    setResponseStatus(event, answer.status);
    return answer.body;
  } catch (e) {
    // The provider already swallows; this guards the wiring itself.
    console.error('[msp] webhook handler error:', errorSummary(e));
    setResponseStatus(event, 200);
    return 'OK';
  }
});
