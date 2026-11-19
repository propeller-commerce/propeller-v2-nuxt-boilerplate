import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awaitsPayment,
  chargeAmount,
  handleMspNotification,
  payable,
  pspReturnUrl,
  signedOrderId,
  UNSIGNED_PER_IP,
  UNSIGNED_PER_ORDER,
  type MspNotification,
  type PayableOrder,
} from '../../server/utils/payment.ts';
import { createRateLimiter } from '../../server/utils/rateLimit.ts';

test('chargeAmount: total.net (incl. VAT) rounded half-up to cents', () => {
  assert.equal(chargeAmount(13.3947), '13.39');
  assert.equal(chargeAmount(13.395), '13.40');
  assert.equal(chargeAmount(1.005), '1.01');
  assert.equal(chargeAmount(2000), '2000.00');
  for (const bad of [0, -1, 0.004, Number.NaN, Infinity, '13.39', null, undefined]) {
    assert.equal(chargeAmount(bad), null, String(bad));
  }
});

const order = (o: Partial<PayableOrder> = {}): PayableOrder => ({
  id: 42,
  userId: 7,
  status: 'UNFINISHED',
  currency: 'EUR',
  total: { net: 121.0049 },
  ...o,
});

test('payable: the server-fetched total and currency, UNFINISHED orders only', () => {
  assert.deepEqual(payable(order(), 'EUR'), { amount: '121.00', currency: 'EUR' });
  assert.deepEqual(payable(order({ currency: null }), 'usd'), { amount: '121.00', currency: 'USD' });
  assert.equal((payable(null, 'EUR') as { status: number }).status, 404);
  for (const status of ['NEW', 'CONFIRMED', 'REQUEST', 'QUOTATION', null]) {
    assert.equal((payable(order({ status }), 'EUR') as { status: number }).status, 409, String(status));
  }
  assert.equal((payable(order({ total: { net: 0 } }), 'EUR') as { status: number }).status, 400);
  assert.equal((payable(order({ total: null }), 'EUR') as { status: number }).status, 400);
  assert.equal((payable(order({ currency: '€' }), '€') as { status: number }).status, 400);
});

test('pspReturnUrl: the site origin and this order thank-you page, whatever the browser sent', () => {
  const site = 'https://shop.test/';
  assert.equal(pspReturnUrl(site, undefined, 42, 'mollie'), 'https://shop.test/checkout/thank-you/42?psp=mollie');
  assert.equal(
    pspReturnUrl(site, 'https://shop.test/en/checkout/thank-you/42?psp=x', 42, 'multisafepay'),
    'https://shop.test/en/checkout/thank-you/42?psp=multisafepay',
  );
  for (const evil of [
    'https://evil.test/checkout/thank-you/42',
    'https://evil.test/phish',
    '//evil.test/checkout/thank-you/42',
    '/checkout/thank-you/43',
    '/en/checkout/thank-you/42/../../../x',
    'javascript:alert(1)',
  ]) {
    const url = pspReturnUrl(site, evil, 42, 'mollie');
    assert.match(url, /^https:\/\/shop\.test(\/[a-z]{2})?\/checkout\/thank-you\/42\?psp=mollie$/, evil);
  }
});

// ── PSP notifications (final review #1): replays of unsigned or misbound notifications ──

function fakeMsp(statusByOrder: Record<number, string>) {
  const calls = { handleWebhook: [] as string[], fetchOrder: [] as number[] };
  const deps = {
    limiter: createRateLimiter(),
    fetchOrder: async (orderId: number) => {
      calls.fetchOrder.push(orderId);
      return statusByOrder[orderId] ? { status: statusByOrder[orderId] } : null;
    },
    provider: () => ({
      handleWebhook: async (id: string) => {
        calls.handleWebhook.push(id);
        return { ok: true };
      },
    }),
  };
  return { deps, calls };
}
const get = (id: string, ip = '203.0.113.7'): MspNotification => ({ method: 'GET', id, ip, signed: false });
const post = (id: string, bodyOrderId: unknown, signed = true): MspNotification => ({
  method: 'POST',
  id,
  ip: '203.0.113.7',
  signed,
  body: JSON.stringify({ order_id: bodyOrderId, transaction_id: 99887766, status: 'completed' }),
});

test('MSP GET for an order still awaiting payment is processed', async () => {
  const { deps, calls } = fakeMsp({ 4711: 'UNFINISHED' });
  assert.deepEqual(await handleMspNotification(get('4711'), deps), { status: 200, body: 'OK' });
  assert.deepEqual(calls.handleWebhook, ['4711']);
});

test('MSP GET for a paid, unknown or unparsable order is acknowledged and never processed', async () => {
  const { deps, calls } = fakeMsp({ 4711: 'NEW', 4712: 'REQUEST' });
  for (const id of ['4711', '4712', '999', 'abc', '']) {
    assert.deepEqual(await handleMspNotification(get(id), deps), { status: 200, body: 'OK' });
  }
  assert.deepEqual(calls.handleWebhook, []);
  assert.deepEqual(calls.fetchOrder, [4711, 4712, 999]);
  const failing = fakeMsp({});
  failing.deps.fetchOrder = async () => {
    throw new Error('upstream down');
  };
  await handleMspNotification(get('4711'), failing.deps);
  assert.deepEqual(failing.calls.handleWebhook, []);
});

test('MSP POST: unsigned refused; signed processed only for the order its body names', async () => {
  const { deps, calls } = fakeMsp({ 4711: 'NEW', 4712: 'UNFINISHED' });
  assert.deepEqual(await handleMspNotification(post('4711', '4711', false), deps), { status: 403, body: 'Invalid signature' });
  // A captured notification for order 4711 replayed with another order id in the query string.
  assert.deepEqual(await handleMspNotification(post('4712', '4711'), deps), { status: 403, body: 'Order mismatch' });
  for (const body of ['', 'not json', '{}', '{"order_id":null}']) {
    assert.equal((await handleMspNotification({ ...post('4712', '4712'), body }, deps)).status, 403, body);
  }
  assert.deepEqual(calls.handleWebhook, []);
  // Signed and bound: processed whatever the order status (refunds, chargebacks).
  assert.equal((await handleMspNotification(post('4711', 4711), deps)).status, 200);
  assert.deepEqual(calls.handleWebhook, ['4711']);
  assert.equal(signedOrderId('{"order_id":" 4711 "}'), '4711');
});

test('MSP GETs are limited per client IP whatever ids they name, and per order', async () => {
  const { deps, calls } = fakeMsp({ 4711: 'UNFINISHED' });
  for (let i = 1; i <= UNSIGNED_PER_IP.limit; i++) {
    assert.equal((await handleMspNotification(get(String(i + 10000)), deps)).status, 200);
  }
  assert.deepEqual(await handleMspNotification(get('4711'), deps), { status: 429, body: 'Too many notifications' });
  assert.equal(calls.fetchOrder.length, UNSIGNED_PER_IP.limit, 'a limited request costs no order lookup');
  // Spread over many addresses, one order is still processed at most UNSIGNED_PER_ORDER times.
  for (let i = 0; i < UNSIGNED_PER_ORDER.limit + 3; i++) await handleMspNotification(get('4711', `198.51.100.${i}`), deps);
  assert.equal(calls.handleWebhook.length, UNSIGNED_PER_ORDER.limit);
  // Signed POSTs are never limited.
  assert.equal((await handleMspNotification(post('4711', '4711'), deps)).status, 200);
});


test('awaitsPayment: only an UNFINISHED order; a bad id costs no lookup', async () => {
  assert.equal(await awaitsPayment('4711', async () => ({ status: 'UNFINISHED' })), true);
  assert.equal(await awaitsPayment(4711, async () => ({ status: 'NEW' })), false);
  let looked = false;
  assert.equal(await awaitsPayment('47 11', async () => ((looked = true), { status: 'UNFINISHED' })), false);
  assert.equal(looked, false);
});
