/**
 * POST /api/mollie/create-payment — start a Mollie payment for a placed order.
 *
 * The Nitro mirror of propeller-vue's Express `/api/mollie/create-payment` and
 * propeller-next's app/api/mollie/create-payment route. The Mollie package is
 * server-side + framework-agnostic; this is the host HTTP layer. The provider
 * talks DIRECTLY to upstream (carrying the order-editor key itself — see
 * server/utils/mollie.ts), not via the /api/graphql proxy.
 *
 * Returns `{ ok, checkoutUrl, paymentId }` on success; the client redirects the
 * shopper to `checkoutUrl` and stashes `paymentId` for the return page.
 */

import { getMollieProvider, isMollieEnabled, isOnAccountMethod } from '../../utils/mollie';

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
  if (!isMollieEnabled(event)) {
    setResponseStatus(event, 503);
    return { error: 'mollie not configured' };
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
  // already skips Mollie for these, but guard server-side too.
  if (isOnAccountMethod(event, b.method)) {
    setResponseStatus(event, 400);
    return { error: 'on-account method does not use a PSP' };
  }

  try {
    const result = await getMollieProvider(event).createPayment({
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
    console.error('[mollie] create-payment failed:', message);
    setResponseStatus(event, 500);
    return { error: 'payment creation failed' };
  }
});
