/**
 * What a PSP payment may be started for (#19), decided from the order as the server fetched it,
 * never from the browser's numbers, and which webhook notifications may run the provider's order
 * processing. Pure; the event-bound flow is `server/utils/paymentAccess.ts`.
 */

import type { RateLimiter, RateLimitRule } from './rateLimit.ts';

/** The fields of an order the payment routes read (fetched with the order-editor key). */
export interface PayableOrder {
  id: number;
  userId?: number | null;
  status?: string | null;
  currency?: string | null;
  total?: { net?: number | null } | null;
}

export type PspProvider = 'mollie' | 'multisafepay';

/**
 * The amount to charge: Propeller's `total.net` is the total INCLUDING VAT (its net/gross naming is
 * inverted), with sub-cent digits; rounded half-up to cents as a major-unit string ("13.39").
 * Null when it isn't a positive number.
 */
export function chargeAmount(net: unknown): string | null {
  if (typeof net !== 'number' || !Number.isFinite(net) || net <= 0) return null;
  // toFixed(6) first so binary drift (1.005 * 100 = 100.4999…) rounds the way the decimal reads.
  const cents = Math.round(Number((net * 100).toFixed(6)));
  return cents > 0 ? (cents / 100).toFixed(2) : null;
}

export type Payable = { amount: string; currency: string } | { status: number; error: string };

/** Amount and currency to charge for `order`, or why it can't be paid (still UNFINISHED only). */
export function payable(order: PayableOrder | null, fallbackCurrency: string): Payable {
  if (!order) return { status: 404, error: 'order not found' };
  if (order.status !== 'UNFINISHED') return { status: 409, error: 'order is not awaiting payment' };
  const amount = chargeAmount(order.total?.net);
  if (!amount) return { status: 400, error: 'order has no payable total' };
  const currency = String(order.currency || fallbackCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { status: 400, error: 'order has no currency' };
  return { amount, currency };
}

/**
 * Where the PSP sends the payer back: always the site's own thank-you page for this order. The
 * browser's URL contributes only its language prefix, and only when its path is exactly that page.
 */
export function pspReturnUrl(siteOrigin: string, clientUrl: unknown, orderId: number, provider: PspProvider): string {
  let path = `/checkout/thank-you/${orderId}`;
  if (typeof clientUrl === 'string') {
    try {
      const given = new URL(clientUrl, 'http://placeholder.invalid').pathname;
      if (new RegExp(`^(/[a-z]{2})?/checkout/thank-you/${orderId}$`).test(given)) path = given;
    } catch {
      /* default path */
    }
  }
  return `${siteOrigin.replace(/\/+$/, '')}${path}?psp=${provider}`;
}

type FetchStatus = (orderId: number) => Promise<Pick<PayableOrder, 'status'> | null>;

/**
 * Whether a payment notification for `orderId` may run the provider's order processing: only while
 * the order is still UNFINISHED (placed, payment pending). The providers re-apply NEW/PAID, the
 * confirmation mail with PDF and the cart delete for every paid state, so running them again for an
 * order already processed re-mails the customer and resets its back-office status. Unknown order or
 * failed lookup: no. `fetchOrder` reads it with the order-editor key.
 */
export async function awaitsPayment(orderId: unknown, fetchOrder: FetchStatus): Promise<boolean> {
  const id = typeof orderId === 'number' ? orderId : typeof orderId === 'string' && /^\d{1,15}$/.test(orderId) ? Number(orderId) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const order = await fetchOrder(id).catch(() => null);
  return order?.status === 'UNFINISHED';
}

/** Unsigned (GET) MSP notifications per client IP and per order: MSP's own servers send a few per order. */
export const UNSIGNED_PER_IP: RateLimitRule = { limit: 30, windowMs: 60_000 };
export const UNSIGNED_PER_ORDER: RateLimitRule = { limit: 10, windowMs: 60 * 60_000 };

/** The order id a signed MSP POST body names (`order_id`), '' when there is none. */
export function signedOrderId(body: string | undefined): string {
  try {
    const orderId = (JSON.parse(body || '') as { order_id?: unknown } | null)?.order_id;
    return typeof orderId === 'string' || typeof orderId === 'number' ? String(orderId).trim() : '';
  } catch {
    return '';
  }
}

export interface MspNotification {
  method: string;
  /** `transactionid`: the Propeller order id. */
  id: string;
  ip: string;
  /** POST only: the `Auth` signature verified over the raw `body`. */
  signed: boolean;
  body?: string;
}

/**
 * One MultiSafepay notification, as the HTTP answer. POST: refused (403) without a valid signature,
 * and when the signed body names another order than the query (a captured notification replayed
 * against another order within the signature window). GET carries no signature
 * (propeller-v2-msp <= 0.1.3 orders send GET), so anyone can send one for any order id: limited per
 * IP and per order (429, MSP retries later), and processed only while the order awaits payment;
 * otherwise acknowledged and dropped. Everything else answers 200 'OK', so MSP doesn't retry-storm.
 */
export async function handleMspNotification(
  n: MspNotification,
  deps: {
    limiter: RateLimiter;
    fetchOrder: FetchStatus;
    provider: () => { handleWebhook(id: string): Promise<{ ok: boolean; error?: string }> };
  },
): Promise<{ status: number; body: string }> {
  const ok = { status: 200, body: 'OK' };
  const tooMany = { status: 429, body: 'Too many notifications' };
  if (n.method === 'POST') {
    if (!n.signed) {
      console.warn('[msp] webhook POST with a missing or invalid signature refused');
      return { status: 403, body: 'Invalid signature' };
    }
    if (!n.id || signedOrderId(n.body) !== n.id) {
      console.warn('[msp] webhook POST for another order than its signed body refused, order:', n.id);
      return { status: 403, body: 'Order mismatch' };
    }
  } else {
    if (!deps.limiter.hit(`msp-webhook:${n.ip}`, UNSIGNED_PER_IP).allowed) return tooMany;
    if (!(await awaitsPayment(n.id, deps.fetchOrder))) return ok;
    // Counted only for an order that would run, so made-up ids add no entries.
    if (!deps.limiter.hit(`msp-webhook-order:${n.id}`, UNSIGNED_PER_ORDER).allowed) return tooMany;
  }
  const result = await deps.provider().handleWebhook(n.id);
  if (!result.ok) console.warn('[msp] webhook not processed:', result.error, 'order:', n.id);
  return ok;
}
