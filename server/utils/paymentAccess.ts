/**
 * Who may start or follow a PSP payment for an order (#19): a verified viewer who placed it
 * (`order.userId`), or the browser that just placed it (signed `propeller_last_order` cookie, set by
 * the GraphQL proxy at cartProcess for guests and logged-in shoppers alike). Amount, currency and
 * return URL come from the server-fetched order and the site URL (`server/utils/payment.ts`).
 */

import type { H3Event } from 'h3';
import { getCookie, getRequestURL, readBody } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { isOnAccountMethod } from './mollie';
import { LAST_ORDER_COOKIE, verifyLastOrder } from './orderEditorRouting';
import { payable, pspReturnUrl, type PayableOrder, type PspProvider } from './payment';
import { cookieSigningSecret, requestBearer, sameOrigin, verifiedViewer } from './requestAuth';

const ORDER_QUERY =
  'query paymentOrder($orderId: Int) { order(orderId: $orderId) { id userId status currency total { net } } }';

/** The order, read with the order-editor key (the storefront key may not read orders); null if unknown. */
export async function fetchPayableOrder(event: H3Event, orderId: number): Promise<PayableOrder | null> {
  const config = useRuntimeConfig(event);
  const res = await fetch(String(config.boilerplateGraphqlEndpoint || ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: String(config.boilerplateOrderEditorApiKey || '') },
    body: JSON.stringify({ query: ORDER_QUERY, variables: { orderId } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`order lookup ${res.status}`);
  const json = (await res.json()) as { data?: { order?: PayableOrder | null } };
  return json.data?.order ?? null;
}

const lastOrderId = (event: H3Event): number | undefined =>
  verifyLastOrder(cookieSigningSecret(event), getCookie(event, LAST_ORDER_COOKIE))?.orderId;

/** A positive integer order id from a body or query value, else null. */
export function orderIdFrom(value: unknown): number | null {
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** May this request see the payment of `orderId`? The cookie first; the viewer costs an order lookup. */
export async function ownsOrder(event: H3Event, orderId: number): Promise<boolean> {
  if (lastOrderId(event) === orderId) return true;
  const viewer = await verifiedViewer(event, requestBearer(event));
  if (!viewer) return false;
  const order = await fetchPayableOrder(event, orderId).catch(() => null);
  return !!order && order.userId === viewer.userId;
}

export interface PaymentArgs {
  orderId: number;
  amount: string;
  currency: string;
  method: string;
  description: string;
  redirectUrl: string;
  userId?: number;
}

/**
 * The create-payment request checked and rebuilt from the order: same-origin JSON, a PSP method,
 * an order the caller owns that is still UNFINISHED. Only `orderId`, `method` and the language prefix
 * of `redirectUrl` are read from the body.
 */
export async function preparePayment(
  event: H3Event,
  provider: PspProvider,
): Promise<{ args: PaymentArgs } | { status: number; error: string }> {
  if (!sameOrigin(event, { json: true })) return { status: 403, error: 'forbidden' };
  const body = (await readBody<Record<string, unknown>>(event).catch(() => null)) || {};
  const orderId = orderIdFrom(body.orderId);
  const method = typeof body.method === 'string' ? body.method.trim() : '';
  if (!orderId || !method) return { status: 400, error: 'missing or invalid fields' };
  // On-account methods never reach the PSP.
  if (isOnAccountMethod(event, method)) return { status: 400, error: 'on-account method does not use a PSP' };

  const order = await fetchPayableOrder(event, orderId);
  const viewer = await verifiedViewer(event, requestBearer(event));
  const viewerOwns = !!viewer && !!order && order.userId === viewer.userId;
  if (!order) return { status: 404, error: 'order not found' };
  if (!viewerOwns && lastOrderId(event) !== orderId) return { status: 403, error: 'forbidden' };

  const config = useRuntimeConfig(event);
  const charge = payable(order, String(config.public?.currencyCode || 'EUR'));
  if ('error' in charge) return charge;

  const site = String(config.public?.siteUrl || '') || getRequestURL(event).origin;
  return {
    args: {
      orderId,
      amount: charge.amount,
      currency: charge.currency,
      method,
      description: `Order ${orderId}`,
      redirectUrl: pspReturnUrl(site, body.redirectUrl, orderId, provider),
      ...(viewerOwns ? { userId: viewer!.userId } : {}),
    },
  };
}
