/**
 * POST /api/mollie/create-payment — start a Mollie payment for a placed order.
 *
 * The Nitro mirror of propeller-vue's Express `/api/mollie/create-payment` and
 * propeller-next's app/api/mollie/create-payment route. The Mollie package is
 * server-side + framework-agnostic; this is the host HTTP layer. The provider
 * talks DIRECTLY to upstream (carrying the order-editor key itself — see
 * server/utils/mollie.ts), not via the /api/graphql proxy.
 *
 * Body: `{ orderId, method, redirectUrl? }`. Only the caller's own UNFINISHED
 * order; amount, currency and return URL come from the server-fetched order
 * and the site URL, never from the body (#19, server/utils/paymentAccess.ts).
 *
 * Returns `{ ok, checkoutUrl, paymentId }` on success; the client redirects the
 * shopper to `checkoutUrl` and stashes `paymentId` for the return page.
 */

import { getMollieProvider, isMollieEnabled } from '../../utils/mollie';
import { preparePayment } from '../../utils/paymentAccess';
import { errorSummary } from '../../utils/httpGuards';

export default defineEventHandler(async (event) => {
  if (!isMollieEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'mollie not configured' };
  }

  try {
    const prepared = await preparePayment(event, 'mollie');
    if ('error' in prepared) {
      setResponseStatus(event, prepared.status);
      return { error: prepared.error };
    }
    const result = await getMollieProvider(event).createPayment(prepared.args);
    return { ok: true, ...result };
  } catch (e) {
    console.error('[mollie] create-payment failed:', errorSummary(e));
    setResponseStatus(event, 500);
    return { error: 'payment creation failed' };
  }
});
