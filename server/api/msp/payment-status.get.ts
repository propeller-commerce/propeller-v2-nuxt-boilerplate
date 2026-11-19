/**
 * GET /api/msp/payment-status?paymentId=<orderId> — live status for the return
 * page. Read-only; does not touch Propeller. A non-ok body means "unknown" so
 * the caller can retry.
 *
 * MultiSafepay keys transactions by `order_id`, so the `paymentId` the client
 * stashed at create time IS the order id we look up here (`orderId` is accepted
 * as an alias). Only for the order's owner (#19): the browser that placed it
 * (signed last-order cookie) or the verified viewer who did.
 *
 * The Nitro mirror of propeller-vue's Express `/api/msp/payment-status` and
 * propeller-next's app/api/msp/payment-status route.
 */

import { getMspProvider, isMspEnabled } from '../../utils/msp';
import { orderIdFrom, ownsOrder } from '../../utils/paymentAccess';
import { errorSummary } from '../../utils/httpGuards';

export default defineEventHandler(async (event) => {
  if (!isMspEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'multisafepay not configured' };
  }

  const q = getQuery(event);
  const orderId = orderIdFrom(String(q.paymentId || q.orderId || '').trim());
  if (!orderId) {
    setResponseStatus(event, 400);
    return { ok: false, error: 'missing paymentId' };
  }
  const paymentId = String(orderId);

  try {
    if (!(await ownsOrder(event, orderId))) return { ok: false, paymentId, error: 'status lookup failed' };
    const result = await getMspProvider(event).getPaymentStatus(paymentId);
    return result; // { ok, paymentId, status?, settled?, orderId?, error? }
  } catch (e) {
    console.error('[msp] payment-status failed:', errorSummary(e));
    return { ok: false, paymentId, error: 'status lookup failed' };
  }
});
