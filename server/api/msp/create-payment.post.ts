/**
 * POST /api/msp/create-payment — start a MultiSafepay payment for a placed order.
 *
 * The Nitro mirror of propeller-vue's Express `/api/msp/create-payment` and
 * propeller-next's app/api/msp/create-payment route. The MSP package is
 * server-side + framework-agnostic; this is the host HTTP layer. The provider
 * talks DIRECTLY to upstream (carrying the order-editor key itself — see
 * server/utils/msp.ts), not via the /api/graphql proxy.
 *
 * Returns `{ ok, checkoutUrl, paymentId }` on success; the client redirects the
 * shopper to `checkoutUrl` and stashes `paymentId` (== the order id — MSP keys
 * by order) for the return page.
 */

import { getMspProvider, isMspEnabled } from '../../utils/msp';
import { isOnAccountMethod } from '../../utils/mollie';

interface CreatePaymentBody {
  orderId?: number;
  amount?: number | string;
  currency?: string;
  method?: string;
  description?: string;
  redirectUrl?: string;
  userId?: number;
  anonymousId?: number;
}

export default defineEventHandler(async (event) => {
  if (!isMspEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'multisafepay not configured' };
  }

  const b = (await readBody<CreatePaymentBody>(event)) || {};
  const valid =
    typeof b.orderId === 'number' &&
    (typeof b.amount === 'number' || typeof b.amount === 'string') &&
    typeof b.currency === 'string' &&
    typeof b.method === 'string' &&
    typeof b.description === 'string' &&
    typeof b.redirectUrl === 'string';
  if (!valid) {
    setResponseStatus(event, 400);
    return { error: 'missing or invalid fields' };
  }

  // Defense in depth: on-account methods must never reach the PSP. The client
  // already skips MSP for these, but guard server-side too. (Provider-agnostic
  // helper — reused from server/utils/mollie.ts.)
  if (isOnAccountMethod(event, b.method)) {
    setResponseStatus(event, 400);
    return { error: 'on-account method does not use a PSP' };
  }

  try {
    const result = await getMspProvider(event).createPayment({
      orderId: b.orderId!,
      amount: b.amount!,
      currency: b.currency!,
      method: b.method!,
      description: b.description!,
      redirectUrl: b.redirectUrl!,
      ...(b.userId !== undefined ? { userId: b.userId } : {}),
      ...(b.anonymousId !== undefined ? { anonymousId: b.anonymousId } : {}),
    });
    return { ok: true, ...result };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'payment creation failed';
    console.error('[msp] create-payment failed:', message);
    setResponseStatus(event, 500);
    return { error: 'payment creation failed' };
  }
});
