/**
 * POST /api/mollie/webhook — Mollie posts form-encoded `id=tr_xxx`. The provider
 * re-fetches from Mollie (the body is never trusted beyond the id), classifies,
 * and updates Propeller. ALWAYS returns 200 so Mollie never retry-storms.
 *
 * The Nitro mirror of propeller-vue's Express `/api/mollie/webhook` and
 * propeller-next's app/api/mollie/webhook route. Nitro's `readBody` auto-parses
 * `application/x-www-form-urlencoded` into an object, so `body.id` is available
 * directly (no explicit urlencoded parser as in the Express host).
 */

import { getMollieProvider, isMollieEnabled } from '../../utils/mollie';

interface WebhookBody {
  id?: string;
}

export default defineEventHandler(async (event) => {
  if (!isMollieEnabled(event)) {
    setResponseStatus(event, 200);
    return '';
  }

  let id = '';
  try {
    const body = await readBody<WebhookBody>(event);
    id = body && body.id ? String(body.id) : '';
  } catch {
    // Unparseable body — fall through; the provider rejects an empty id and we
    // still return 200 so Mollie doesn't retry-storm.
  }

  try {
    const result = await getMollieProvider(event).handleWebhook(id);
    if (!result.ok) {
      console.warn('[mollie] webhook not processed:', result.error, 'payment:', id);
    }
  } catch (e) {
    console.error('[mollie] webhook handler error:', e instanceof Error ? e.message : e);
  }

  // Always 200 — Mollie treats any non-2xx as failure and retries.
  setResponseStatus(event, 200);
  return '';
});
