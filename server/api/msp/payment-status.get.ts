/**
 * GET /api/msp/payment-status?paymentId=<orderId> — live status for the return
 * page. Read-only; does not touch Propeller. A non-ok body means "unknown" so
 * the caller can retry.
 *
 * MultiSafepay keys transactions by `order_id`, so the `paymentId` the client
 * stashed at create time IS the order id we look up here (`orderId` is accepted
 * as an alias).
 *
 * The Nitro mirror of propeller-vue's Express `/api/msp/payment-status` and
 * propeller-next's app/api/msp/payment-status route.
 */

import { getMspProvider, isMspEnabled } from '../../utils/msp';

export default defineEventHandler(async (event) => {
  if (!isMspEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'multisafepay not configured' };
  }

  const q = getQuery(event);
  const paymentId = String(q.paymentId || q.orderId || '').trim();
  if (!paymentId) {
    setResponseStatus(event, 400);
    return { ok: false, error: 'missing paymentId' };
  }

  try {
    const result = await getMspProvider(event).getPaymentStatus(paymentId);
    return result; // { ok, paymentId, status?, settled?, orderId?, error? }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'status lookup failed';
    console.error('[msp] payment-status failed:', message);
    return { ok: false, paymentId, error: 'status lookup failed' };
  }
});
