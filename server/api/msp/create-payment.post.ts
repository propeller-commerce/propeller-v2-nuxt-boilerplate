/**
 * POST /api/msp/create-payment — start a MultiSafepay payment for a placed order.
 *
 * The Nitro mirror of propeller-vue's Express `/api/msp/create-payment` and
 * propeller-next's app/api/msp/create-payment route. The MSP package is
 * server-side + framework-agnostic; this is the host HTTP layer. The provider
 * talks DIRECTLY to upstream (carrying the order-editor key itself — see
 * server/utils/msp.ts), not via the /api/graphql proxy.
 *
 * Body: `{ orderId, method, redirectUrl? }`. Only the caller's own UNFINISHED
 * order; amount, currency and return URL come from the server-fetched order
 * and the site URL, never from the body (#19, server/utils/paymentAccess.ts).
 *
 * Returns `{ ok, checkoutUrl, paymentId }` on success; the client redirects the
 * shopper to `checkoutUrl` and stashes `paymentId` (== the order id — MSP keys
 * by order) for the return page.
 */

import { getMspProvider, isMspEnabled } from '../../utils/msp';
import { preparePayment } from '../../utils/paymentAccess';
import { errorSummary } from '../../utils/httpGuards';

export default defineEventHandler(async (event) => {
  if (!isMspEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'multisafepay not configured' };
  }

  try {
    const prepared = await preparePayment(event, 'multisafepay');
    if ('error' in prepared) {
      setResponseStatus(event, prepared.status);
      return { error: prepared.error };
    }
    const result = await getMspProvider(event).createPayment(prepared.args);
    return { ok: true, ...result };
  } catch (e) {
    console.error('[msp] create-payment failed:', errorSummary(e));
    setResponseStatus(event, 500);
    return { error: 'payment creation failed' };
  }
});
