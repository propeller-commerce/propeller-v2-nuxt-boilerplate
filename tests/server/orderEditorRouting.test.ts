import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyOperation,
  createdOrderId,
  signLastOrder,
  verifyLastOrder,
} from '../../server/utils/orderEditorRouting.ts';

const KEY = 'order-editor-test-key';

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

const base = { isAnonymous: true, orderEditorOptIn: false, lastOrderId: null as string | null };

test('the real order-editor mutations elevate', () => {
  for (const name of ['orderSetStatus', 'passwordResetLink', 'triggerQuoteSendRequest', 'triggerOrderSendConfirm']) {
    const query = `mutation ${name}($input: X!) { ${name}(input: $input) }`;
    assert.equal(classifyOperation({ ...base, body: { query, operationName: name } }), 'order-editor', name);
  }
  assert.equal(classifyOperation({ ...base, body: { query: SET_STATUS, variables: {} } }), 'order-editor');
});

test('__typename alongside the field is ignored', () => {
  const query = 'mutation { __typename orderSetStatus(input: {}) { id } }';
  assert.equal(classifyOperation({ ...base, body: { query } }), 'order-editor');
});

test('a fake operationName never elevates', () => {
  assert.equal(
    classifyOperation({ ...base, body: { operationName: 'orderSetStatus', query: '{ contacts { items { email } } }' } }),
    'general',
  );
  assert.equal(classifyOperation({ ...base, body: { operationName: 'orderSetStatus' } }), 'general');
});

test('an operation named orderSetStatus selecting contacts does not elevate', () => {
  const query = 'query orderSetStatus { contacts { items { email } } }';
  assert.equal(classifyOperation({ ...base, body: { query, operationName: 'orderSetStatus' } }), 'general');
});

test('an allowlisted mutation field sent as a query does not elevate', () => {
  assert.equal(classifyOperation({ ...base, body: { query: 'query { orderSetStatus(input: {}) { id } }' } }), 'general');
});

test('a second top-level field does not elevate', () => {
  const query =
    'mutation { orderSetStatus(input: {}) { id } contactRegister(input: {}) { session { accessToken } } }';
  assert.equal(classifyOperation({ ...base, body: { query } }), 'general');
});

test('a top-level fragment spread does not elevate', () => {
  const query = 'fragment F on Mutation { orderSetStatus(input: {}) { id } } mutation { ...F }';
  assert.equal(classifyOperation({ ...base, body: { query } }), 'general');
  const inline = 'mutation { ... on Mutation { orderSetStatus(input: {}) { id } } }';
  assert.equal(classifyOperation({ ...base, body: { query: inline } }), 'general');
});

test('two operations do not elevate', () => {
  const query = `${SET_STATUS}\nquery contacts { contacts { items { email } } }`;
  assert.equal(classifyOperation({ ...base, body: { query, operationName: 'orderSetStatus' } }), 'general');
});

test('unparseable or non-object bodies never elevate', () => {
  assert.equal(classifyOperation({ ...base, body: { query: 'mutation orderSetStatus {' } }), 'general');
  assert.equal(classifyOperation({ ...base, body: [{ query: SET_STATUS }] }), 'general');
  assert.equal(classifyOperation({ ...base, body: null }), 'general');
  assert.equal(classifyOperation({ ...base, body: { query: 42 } }), 'general');
});

test('anonymous order query elevates only with a matching signed order id', () => {
  const vars = { orderId: 123, language: 'NL' };
  assert.equal(classifyOperation({ ...base, body: { query: ORDER, variables: vars } }), 'general');
  assert.equal(classifyOperation({ ...base, lastOrderId: '999', body: { query: ORDER, variables: vars } }), 'general');
  assert.equal(classifyOperation({ ...base, lastOrderId: '123', body: { query: ORDER, variables: vars } }), 'order-editor');
});

test('order query for an authenticated caller stays on the general key', () => {
  assert.equal(
    classifyOperation({
      ...base,
      isAnonymous: false,
      lastOrderId: '123',
      body: { query: ORDER, variables: { orderId: 123 } },
    }),
    'general',
  );
});

test('order query cannot dodge the id check', () => {
  const ok = { ...base, lastOrderId: '123' };
  assert.equal(
    classifyOperation({ ...ok, body: { query: '{ order(orderId: 5) { id } }', variables: { orderId: 123 } } }),
    'general',
  );
  assert.equal(classifyOperation({ ...ok, body: { query: '{ order(orderId: 123) { id } }' } }), 'order-editor');
  assert.equal(
    classifyOperation({ ...ok, body: { query: ORDER, variables: { orderId: 123, orderUUID: 'abc' } } }),
    'general',
  );
  assert.equal(classifyOperation({ ...ok, body: { query: '{ order(orderUUID: "abc") { id } }' } }), 'general');
  assert.equal(
    classifyOperation({ ...ok, body: { query: 'query($o: Int = 123) { order(orderId: $o) { id } }' } }),
    'general',
  );
  assert.equal(classifyOperation({ ...ok, body: { query: '{ order { id } }' } }), 'general');
  assert.equal(
    classifyOperation({ ...ok, body: { query: ORDER, variables: { orderId: '123abc' } } }),
    'general',
  );
});

test('contactRegister needs the opt-in header and a session', () => {
  const query =
    'mutation contactRegister($i: RegisterContactInput!) { contactRegister(input: $i) { session { accessToken } } }';
  assert.equal(classifyOperation({ ...base, body: { query } }), 'general');
  assert.equal(classifyOperation({ ...base, orderEditorOptIn: true, body: { query } }), 'general');
  assert.equal(classifyOperation({ ...base, isAnonymous: false, body: { query } }), 'general');
  assert.equal(
    classifyOperation({ ...base, isAnonymous: false, orderEditorOptIn: true, body: { query } }),
    'order-editor-session',
  );
});

test('signed last-order cookie round-trips and rejects tampering', () => {
  const value = signLastOrder(123, KEY);
  assert.match(value, /^123\.[0-9a-f]{64}$/);
  assert.equal(verifyLastOrder(value, KEY), '123');
  assert.equal(verifyLastOrder(value, 'other-key'), null);
  assert.equal(verifyLastOrder(value.replace(/^123/, '124'), KEY), null);
  assert.equal(verifyLastOrder('123', KEY), null);
  assert.equal(verifyLastOrder('123.abc', KEY), null);
  assert.equal(verifyLastOrder(undefined, KEY), null);
  assert.equal(verifyLastOrder(value, ''), null);
});

test('createdOrderId reads cartProcess responses only', () => {
  const query =
    'mutation cartProcess($id: String!, $input: CartProcessInput!) { cartProcess(id: $id, input: $input) { cartOrderId } }';
  const response = JSON.stringify({ data: { cartProcess: { cartOrderId: 77, cart: { cartId: 'x' } } } });
  assert.equal(createdOrderId({ query }, response), '77');
  const aliased = 'mutation { placed: cartProcess(id: "1", input: {}) { cartOrderId } }';
  assert.equal(createdOrderId({ query: aliased }, JSON.stringify({ data: { placed: { cartOrderId: 8 } } })), '8');
  assert.equal(
    createdOrderId({ query: SET_STATUS }, JSON.stringify({ data: { orderSetStatus: { cartOrderId: 9 } } })),
    null,
  );
  assert.equal(createdOrderId({ query }, JSON.stringify({ errors: [{ message: 'x' }] })), null);
  assert.equal(createdOrderId({ query }, 'not json'), null);
  assert.equal(
    createdOrderId({ query }, JSON.stringify({ data: { cartProcess: { cartOrderId: '1; drop' } } })),
    null,
  );
});
