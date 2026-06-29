/**
 * GET /api/mollie/payment-status?paymentId=tr_xxx — live status for the return
 * page. Read-only; does not touch Propeller. A non-ok body means "unknown" so
 * the caller can retry.
 *
 * The Nitro mirror of propeller-vue's Express `/api/mollie/payment-status` and
 * propeller-next's app/api/mollie/payment-status route.
 */

import { getMollieProvider, isMollieEnabled } from '../../utils/mollie';

export default defineEventHandler(async (event) => {
  if (!isMollieEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'mollie not configured' };
  }

  const paymentId = String(getQuery(event).paymentId || '').trim();
  if (!paymentId) {
    setResponseStatus(event, 400);
    return { ok: false, error: 'missing paymentId' };
  }

  try {
    const result = await getMollieProvider(event).getPaymentStatus(paymentId);
    return result; // { ok, paymentId, status?, settled?, orderId?, error? }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'status lookup failed';
    console.error('[mollie] payment-status failed:', message);
    return { ok: false, paymentId, error: 'status lookup failed' };
  }
});
