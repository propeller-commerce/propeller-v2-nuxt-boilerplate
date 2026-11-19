/**
 * GET /api/mollie/payment-status?paymentId=tr_xxx — live status for the return
 * page. Read-only; does not touch Propeller. A non-ok body means "unknown" so
 * the caller can retry.
 *
 * Only for the order's owner (#19): the browser that placed it (signed last-order
 * cookie) or the verified viewer who did. Anyone else gets the same answer as an
 * unknown payment.
 *
 * The Nitro mirror of propeller-vue's Express `/api/mollie/payment-status` and
 * propeller-next's app/api/mollie/payment-status route.
 */

import { getMollieProvider, isMollieEnabled } from '../../utils/mollie';
import { orderIdFrom, ownsOrder } from '../../utils/paymentAccess';
import { errorSummary } from '../../utils/httpGuards';

export default defineEventHandler(async (event) => {
  if (!isMollieEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'mollie not configured' };
  }

  const paymentId = String(getQuery(event).paymentId || '').trim();
  if (!/^tr_[A-Za-z0-9]{1,64}$/.test(paymentId)) {
    setResponseStatus(event, 400);
    return { ok: false, error: 'missing paymentId' };
  }

  try {
    const result = await getMollieProvider(event).getPaymentStatus(paymentId);
    // The order id lives in the Mollie payment's metadata: check ownership after the lookup.
    const orderId = orderIdFrom(result.orderId);
    if (!result.ok || !orderId || !(await ownsOrder(event, orderId))) {
      return { ok: false, paymentId, error: 'status lookup failed' };
    }
    return result; // { ok, paymentId, status?, settled?, orderId?, error? }
  } catch (e) {
    console.error('[mollie] payment-status failed:', errorSummary(e));
    return { ok: false, paymentId, error: 'status lookup failed' };
  }
});
