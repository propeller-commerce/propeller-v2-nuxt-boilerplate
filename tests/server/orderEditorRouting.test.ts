import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'graphql';
import {
  classifyOperation,
  createdOrderId,
  createSpentLog,
  settleReserved,
  signLastOrder,
  singleTopLevelField,
  verifyLastOrder,
  type ClassifyInput,
} from '../../server/utils/orderEditorRouting.ts';
import { signCookieValue } from '../../server/utils/signedCookie.ts';

const SECRET = 'cookie-signing-test-secret';

const SET_STATUS = `mutation orderSetStatus($input: OrderSetStatusInput!) {
  orderSetStatus(input: $input) {
    id
  }
}`;

const ORDER = `fragment OrderFields on Order { id status }
query order($orderId: Int, $orderUUID: String, $language: String) {
  order(orderId: $orderId, orderUUID: $orderUUID) {
    ...OrderFields
  }
}`;

const single = (query: string) => singleTopLevelField(parse(query, { noLocation: true }));
const ctx = (query: string, extra: Partial<ClassifyInput> = {}): ClassifyInput => ({
  doc: parse(query, { noLocation: true }),
  single: single(query),
  variables: {},
  isAnonymous: true,
  orderEditorOptIn: false,
  lastOrder: null,
  ...extra,
});
const key = (input: ClassifyInput) => classifyOperation(input).key;
const last = (orderId: number, used = '') => ({ orderId, used });
const checkout = (status: string, extra: Record<string, unknown> = {}) => ({ input: { orderId: 9, status, ...extra } });

test('passwordResetLink never elevates', () => {
  const doc = 'mutation passwordResetLink($input: PasswordRecoveryLinkInput) { passwordResetLink(input: $input) }';
  assert.equal(key(ctx(doc, { variables: { input: { email: 'victim@example.test' } } })), 'general');
  assert.equal(key(ctx(doc, { isAnonymous: false, lastOrder: last(9) })), 'general');
});

test('checkout mutations elevate only for the signed last order', () => {
  for (const name of ['orderSetStatus', 'triggerQuoteSendRequest', 'triggerOrderSendConfirm']) {
    const query = `mutation ${name}($input: X!) { ${name}(input: $input) }`;
    const vars = checkout('NEW', { payStatus: 'OPEN' });
    assert.equal(key(ctx(query, { variables: vars })), 'general', `${name} without a cookie`);
    assert.equal(key(ctx(query, { variables: vars, lastOrder: last(8) })), 'general', `${name} other order`);
    assert.deepEqual(classifyOperation(ctx(query, { variables: vars, lastOrder: last(9) })).key, 'order-editor', name);
    // Logged-in sessions are bound to the cookie too.
    assert.equal(key(ctx(query, { variables: vars, isAnonymous: false })), 'general', `${name} logged in, no cookie`);
    assert.equal(key(ctx(query, { variables: vars, isAnonymous: false, lastOrder: last(9) })), 'order-editor');
  }
});

test('each checkout mutation runs once per order', () => {
  const flags = { orderSetStatus: 's', triggerQuoteSendRequest: 'q', triggerOrderSendConfirm: 'c' };
  for (const [name, flag] of Object.entries(flags)) {
    const query = `mutation ${name}($input: X!) { ${name}(input: $input) }`;
    assert.deepEqual(classifyOperation(ctx(query, { variables: checkout('NEW'), lastOrder: last(9) })), { key: 'order-editor', flag });
    assert.equal(key(ctx(query, { variables: checkout('NEW'), lastOrder: last(9, flag) })), 'general', name);
  }
});

test('orderSetStatus elevates only with checkout status values', () => {
  const run = (vars: unknown) => key(ctx(SET_STATUS, { variables: vars, lastOrder: last(9) }));
  for (const status of ['NEW', 'REQUEST', 'UNFINISHED']) {
    assert.equal(run(checkout(status)), 'order-editor', status);
    assert.equal(run(checkout(status, { payStatus: 'OPEN', deleteCart: true, sendOrderConfirmationEmail: true })), 'order-editor');
  }
  assert.equal(run(checkout('NEW', { payStatus: 'PAID' })), 'general');
  assert.equal(run(checkout('CANCELLED')), 'general');
  assert.equal(run(checkout('QUOTATION')), 'general');
  assert.equal(run({ input: { orderId: 9 } }), 'general');
  // Inline input is read the same way.
  assert.equal(key(ctx('mutation { orderSetStatus(input: { orderId: 9, status: NEW, payStatus: OPEN }) { id } }', { lastOrder: last(9) })), 'order-editor');
  assert.equal(key(ctx('mutation { orderSetStatus(input: { orderId: 9, status: NEW, payStatus: PAID }) { id } }', { lastOrder: last(9) })), 'general');
});

test('the SDK checkout sends what is elevated (vue-ui placeOrder)', () => {
  const vars = {
    input: { orderId: 9, status: 'UNFINISHED', payStatus: 'OPEN', sendOrderConfirmationEmail: false, addPDFAttachment: false, triggerOrderSendConfirmEvent: false, deleteCart: false },
  };
  assert.equal(key(ctx(SET_STATUS, { variables: vars, lastOrder: last(9) })), 'order-editor');
  const quote = 'mutation triggerQuoteSendRequest($input: TriggerQuoteSendRequestEventInput!) { triggerQuoteSendRequest(input: $input) }';
  assert.equal(key(ctx(quote, { variables: { input: { orderId: 9, language: 'NL' } }, lastOrder: last(9, 's') })), 'order-editor');
});

test('accepting a quote is a separate, ownership-checked choice for logged-in callers only', () => {
  const vars = { input: { orderId: 40, status: 'NEW' } };
  assert.deepEqual(classifyOperation(ctx(SET_STATUS, { variables: vars, isAnonymous: false })), { key: 'quote-accept', orderId: 40 });
  assert.equal(key(ctx(SET_STATUS, { variables: vars })), 'general');
  assert.equal(key(ctx(SET_STATUS, { variables: { input: { orderId: 40, status: 'NEW', payStatus: 'PAID' } }, isAnonymous: false })), 'general');
  assert.equal(key(ctx(SET_STATUS, { variables: { input: { orderId: 40, status: 'REQUEST' } }, isAnonymous: false })), 'general');
  assert.equal(key(ctx(SET_STATUS, { variables: { input: { orderId: 40, status: 'NEW', deleteCart: true } }, isAnonymous: false })), 'general');
});

test('__typename alongside the field is ignored', () => {
  const query = 'mutation { __typename orderSetStatus(input: { orderId: 9, status: NEW }) { id } }';
  assert.equal(key(ctx(query, { lastOrder: last(9) })), 'order-editor');
});

test('an operation named orderSetStatus selecting contacts does not elevate', () => {
  assert.equal(key(ctx('query orderSetStatus { contacts { items { email } } }', { lastOrder: last(9) })), 'general');
  assert.equal(key(ctx('query { orderSetStatus(input: { orderId: 9, status: NEW }) { id } }', { lastOrder: last(9) })), 'general');
});

test('a second top-level field, a top-level fragment or two operations do not elevate', () => {
  const opts = { lastOrder: last(9) };
  assert.equal(key(ctx('mutation { orderSetStatus(input: { orderId: 9, status: NEW }) { id } contactRegister(input: {}) { session { accessToken } } }', opts)), 'general');
  assert.equal(key(ctx('fragment F on Mutation { orderSetStatus(input: { orderId: 9, status: NEW }) { id } } mutation { ...F }', opts)), 'general');
  assert.equal(key(ctx('mutation { ... on Mutation { orderSetStatus(input: { orderId: 9, status: NEW }) { id } } }', opts)), 'general');
  assert.equal(key(ctx(`${SET_STATUS}\nquery contacts { contacts { items { email } } }`, { ...opts, variables: checkout('NEW') })), 'general');
  assert.equal(classifyOperation({ ...ctx('{ a }'), single: null }).key, 'general');
});

test('queries never elevate here (order reads: orderReads.test.ts)', () => {
  assert.equal(key(ctx(ORDER, { variables: { orderId: 123 }, lastOrder: last(123) })), 'general');
  assert.equal(key(ctx('{ order(orderId: 123) { id } }', { lastOrder: last(123), isAnonymous: false })), 'general');
});

test('contactRegister with a selection of its own is never elevated, opt-in and session or not (SDK document: sdkDocuments.test.ts)', () => {
  const query = 'mutation contactRegister($i: RegisterContactInput!) { contactRegister(input: $i) { session { accessToken } contact { company { contacts { items { email } } } } } }';
  const variables = { i: { email: 'x@example.test', parentId: 37 } };
  assert.equal(key(ctx(query, { variables })), 'general');
  assert.equal(key(ctx(query, { variables, orderEditorOptIn: true })), 'general');
  assert.equal(key(ctx(query, { variables, isAnonymous: false })), 'general');
  assert.equal(key(ctx(query, { variables, isAnonymous: false, orderEditorOptIn: true })), 'general');
});

test('signed last-order cookie round-trips with its flags and rejects tampering', () => {
  const value = signLastOrder(SECRET, 123);
  assert.deepEqual(verifyLastOrder(SECRET, value), { orderId: 123, used: '' });
  assert.deepEqual(verifyLastOrder(SECRET, signLastOrder(SECRET, 123, 'sq')), { orderId: 123, used: 'sq' });
  assert.equal(verifyLastOrder('other-secret', value), null);
  assert.equal(verifyLastOrder('', value), null);
  assert.equal(verifyLastOrder(SECRET, `x${value}`), null);
  assert.equal(verifyLastOrder(SECRET, '123'), null);
  assert.equal(verifyLastOrder(SECRET, undefined), null);
  // The old unsigned-purpose format and other purposes don't verify.
  assert.equal(verifyLastOrder(SECRET, signCookieValue(SECRET, 'registration', '123:', 3600)), null);
  // Expired after an hour.
  const now = Date.now();
  assert.equal(verifyLastOrder(SECRET, signLastOrder(SECRET, 123, '', now), now + 3601_000), null);
});

test('the spent log keeps flags per order, bounded and for as long as the cookie lives', () => {
  let t = 0;
  const log = createSpentLog({ ttlMs: 1000, maxEntries: 2, now: () => t });
  log.add(1, 's');
  log.add(1, 'q');
  log.add(1, 's');
  assert.equal(log.flags(1), 'sq');
  log.add(2, 'c');
  log.add(3, 'c');
  assert.equal(log.size(), 2);
  assert.equal(log.flags(1), '');
  t = 1001;
  assert.equal(log.flags(3), '');
});

test('createdOrderId reads cartProcess responses only', () => {
  const query = 'mutation cartProcess($id: String!, $input: CartProcessInput!) { cartProcess(id: $id, input: $input) { cartOrderId } }';
  assert.equal(createdOrderId(single(query), { data: { cartProcess: { cartOrderId: 77, cart: { cartId: 'x' } } } }), 77);
  const aliased = 'mutation { placed: cartProcess(id: "1", input: {}) { cartOrderId } }';
  assert.equal(createdOrderId(single(aliased), { data: { placed: { cartOrderId: 8 } } }), 8);
  assert.equal(createdOrderId(single(SET_STATUS), { data: { orderSetStatus: { cartOrderId: 9 } } }), null);
  assert.equal(createdOrderId(single(query), { errors: [{ message: 'x' }] }), null);
  assert.equal(createdOrderId(single(query), { data: { cartProcess: { cartOrderId: '1; drop' } } }), null);
  assert.equal(createdOrderId(null, { data: { cartProcess: { cartOrderId: 1 } } }), null);
});

test('parallel requests with the same last-order cookie: only one reserves the checkout mutation', async () => {
  const log = createSpentLog();
  // The proxy's awaits between reading the flags and spending one (viewer lookups).
  const slowLookup = () => new Promise((resolve) => setTimeout(resolve, 5));
  const variables = { input: { orderId: 9, status: 'NEW', payStatus: 'OPEN' } };
  const request = async () => {
    const choice = classifyOperation(ctx(SET_STATUS, { variables, lastOrder: last(9, log.flags(9)) }));
    await slowLookup();
    return choice.key === 'order-editor' && !!choice.flag && log.reserve(9, choice.flag);
  };
  const results = await Promise.all(Array.from({ length: 5 }, request));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(log.flags(9), 's');
});

test('a reserved checkout flag is released when the upstream call throws or fails, kept when it ran', async () => {
  const log = createSpentLog();
  const reserved = { orderId: 4711, flag: 'c' };
  const failed = (r: { ok: boolean }) => !r.ok;
  // A network error after reserve(): released, error passed on.
  assert.equal(log.reserve(4711, 'c'), true);
  const fetchThrows = async (): Promise<{ ok: boolean }> => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(settleReserved(log, reserved, fetchThrows, failed), /fetch failed/);
  assert.equal(log.flags(4711), '');
  // An upstream error answer: released.
  assert.equal(log.reserve(4711, 'c'), true);
  await settleReserved(log, reserved, async () => ({ ok: false }), failed);
  assert.equal(log.flags(4711), '');
  // It ran: stays spent.
  assert.equal(log.reserve(4711, 'c'), true);
  await settleReserved(log, reserved, async () => ({ ok: true }), failed);
  assert.equal(log.flags(4711), 'c');
  assert.equal(log.reserve(4711, 'c'), false);
});
