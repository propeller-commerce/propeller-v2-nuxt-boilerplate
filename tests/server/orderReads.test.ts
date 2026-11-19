import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { parse } from 'graphql';
import {
  ORDER_READ_DOCUMENT_HASHES,
  orderReadAllowed,
  readsOrders,
  singleTopLevelField,
  type LastOrder,
  type OrderReadInput,
} from '../../server/utils/orderEditorRouting.ts';
import { documentHash } from '../../server/utils/registrationRouting.ts';
import type { Viewer } from '../../server/utils/viewer.ts';

// The installed SDK's documents: what vue-ui's useOrders sends.
const OPS = 'node_modules/@propeller-commerce/propeller-sdk-v2/dist/esm/generated/operations/';
const sdkDocument = async (name: string): Promise<string> =>
  (await import(pathToFileURL(`${process.cwd()}/${OPS}${name}.js`).href)).document;
const ORDER = await sdkDocument('order');
const ORDERS = await sdkDocument('orders');
const ORDER_PDF = await sdkDocument('orderGetPDF');
const QUOTE_PDF = await sdkDocument('quoteGetPDF');

const contact: Viewer = { type: 'Contact', userId: 73, companyIds: [37, 39], managerOf: [] };
const customer: Viewer = { type: 'Customer', userId: 71, companyIds: [], managerOf: [] };
const last = (orderId: number): LastOrder => ({ orderId, used: '' });
// Order 2621 was placed by contact 73, 2492 by customer 71; 2700 is a draft quote of contact 73.
const OWNERS: Record<number, { userId: number; status: string }> = {
  2621: { userId: 73, status: 'NEW' },
  2492: { userId: 71, status: 'CONFIRMED' },
  2700: { userId: 73, status: 'DRAFT_QUOTATION' },
};
const lookups: number[] = [];
const ownerLookup = async (orderId: number) => {
  lookups.push(orderId);
  return OWNERS[orderId] ?? null;
};

const doc = (query: string) => parse(query, { noLocation: true });
const allowed = (query: string, extra: Partial<OrderReadInput> = {}) => {
  const parsed = doc(query);
  return orderReadAllowed({
    doc: parsed,
    single: singleTopLevelField(parsed),
    variables: {},
    viewer: null,
    lastOrder: null,
    orderOwner: ownerLookup,
    ...extra,
  });
};

test('the allowlisted order-read hashes match the installed SDK documents (update them after an SDK upgrade)', () => {
  for (const [name, query] of Object.entries({ order: ORDER, orders: ORDERS, orderGetPDF: ORDER_PDF, quoteGetPDF: QUOTE_PDF })) {
    assert.equal(documentHash(doc(query)), ORDER_READ_DOCUMENT_HASHES[name], name);
  }
});

test('anonymous: only order(orderId) of the signed last order', async () => {
  assert.equal(await allowed(ORDER, { variables: { orderId: 2621, language: 'NL' }, lastOrder: last(2621) }), true);
  assert.equal(await allowed(ORDER, { variables: { orderId: 2492 }, lastOrder: last(2621) }), false);
  assert.equal(await allowed(ORDER, { variables: { orderId: 2621 } }), false);
  // No viewer: no owner lookup at all.
  lookups.length = 0;
  assert.equal(await allowed(ORDER_PDF, { variables: { orderId: 2621 }, lastOrder: last(2621) }), false);
  assert.equal(await allowed(QUOTE_PDF, { variables: { quoteId: 2621 }, lastOrder: last(2621) }), false);
  assert.equal(await allowed(ORDERS, { variables: { input: { userId: [73], status: ['NEW'] } }, lastOrder: last(2621) }), false);
  assert.deepEqual(lookups, []);
});

test('the last-order read cannot dodge the id check', async () => {
  const ok = { lastOrder: last(123) };
  assert.equal(await allowed(ORDER, { ...ok, variables: { orderId: 123 } }), true);
  assert.equal(await allowed(ORDER, { ...ok, variables: { orderId: 123, orderUUID: 'abc' } }), false);
  assert.equal(await allowed(ORDER, { ...ok, variables: { orderUUID: 'abc' } }), false);
  assert.equal(await allowed(ORDER, { ...ok, variables: { orderId: '123abc' } }), false);
  assert.equal(await allowed(ORDER, ok), false);
  // Not the SDK's document: refused even for the right id.
  assert.equal(await allowed('{ order(orderId: 123) { id } }', ok), false);
  assert.equal(await allowed('query($o: Int = 123) { order(orderId: $o) { id } }', ok), false);
});

test('verified owner: the SDK order, orderGetPDF and quoteGetPDF of an order they placed', async () => {
  assert.equal(await allowed(ORDER, { variables: { orderId: 2621 }, viewer: contact }), true);
  assert.equal(await allowed(ORDER_PDF, { variables: { orderId: 2621 }, viewer: contact }), true);
  assert.equal(await allowed(QUOTE_PDF, { variables: { quoteId: 2621 }, viewer: contact }), true);
  assert.equal(await allowed(ORDER, { variables: { orderId: 2492 }, viewer: customer }), true);
});

test("another user's order is refused, by id or UUID", async () => {
  assert.equal(await allowed(ORDER, { variables: { orderId: 2492 }, viewer: contact }), false);
  assert.equal(await allowed(ORDER_PDF, { variables: { orderId: 2492 }, viewer: contact }), false);
  assert.equal(await allowed(QUOTE_PDF, { variables: { quoteId: 2621 }, viewer: customer }), false);
  assert.equal(await allowed(ORDER, { variables: { orderUUID: 'a-b' }, viewer: contact }), false);
  assert.equal(await allowed(ORDER, { variables: { orderId: 2621, orderUUID: 'a-b' }, viewer: contact }), false);
  // The last-order cookie is the guest's way in; a verified viewer needs to own the order.
  assert.equal(await allowed(ORDER, { variables: { orderId: 2492 }, viewer: contact, lastOrder: last(2492) }), false);
});

test('an own order read with a selection of its own is refused (the order-editor key would run it)', async () => {
  const company = '{ order(orderId: 2621) { id company { contacts { items { email } } } } }';
  assert.equal(readsOrders(doc(company)), true);
  assert.equal(await allowed(company, { viewer: contact }), false);
  assert.equal(await allowed('{ orderGetPDF(orderId: 2621) { base64 } }', { viewer: contact }), false);
  assert.equal(await allowed('{ orders(input: { userId: [73] }) { items { id } } }', { viewer: contact }), false);
});

test('owner lookup null, failing or without a matching userId: refused (fail closed)', async () => {
  const vars = { variables: { orderId: 2621 }, viewer: contact };
  assert.equal(await allowed(ORDER, { ...vars, orderOwner: async () => null }), false);
  assert.equal(await allowed(ORDER, { ...vars, orderOwner: async () => ({}) }), false);
  assert.equal(await allowed(ORDER, { ...vars, orderOwner: async () => ({ userId: '73', status: 'NEW' }) }), false);
  // No status in the answer: treated as a draft.
  assert.equal(await allowed(ORDER, { ...vars, orderOwner: async () => ({ userId: 73 }) }), false);
  const down = async (): Promise<null> => {
    throw new Error('upstream down');
  };
  assert.equal(await allowed(ORDER_PDF, { ...vars, orderOwner: down }), false);
  assert.equal(await allowed(ORDER, { variables: { orderId: 999 }, viewer: contact }), false);
});

test('orders: only filtered on the viewer itself, and on its own companies', async () => {
  const run = (input: Record<string, unknown> | undefined, viewer: Viewer | null = contact) =>
    allowed(ORDERS, { variables: { input: input && { status: ['NEW'], ...input } }, viewer });
  assert.equal(await run({ userId: 73 }), true);
  assert.equal(await run({ userId: [73], companyIds: [37, 39] }), true);
  assert.equal(await run({ userId: [71] }), false);
  assert.equal(await run({ userId: [73, 71] }), false);
  assert.equal(await run({ userId: ['73'] }), false);
  assert.equal(await run({ userId: [] }), false);
  assert.equal(await run({}), false);
  assert.equal(await run(undefined), false);
  assert.equal(await run({ userId: [73], companyIds: [37, 41] }), false);
  assert.equal(await run({ userId: [73], companyIds: 41 }), false);
  assert.equal(await run({ userId: [71] }, customer), true);
  // A customer filtering on companies is refused even with its own id.
  assert.equal(await run({ userId: [71], companyIds: [37] }, customer), false);
  assert.equal(await run({ userId: [73] }, null), false);
});

test('drafts stay hidden: single reads of a draft and order lists without listed statuses are refused', async () => {
  for (const query of [ORDER, ORDER_PDF]) {
    assert.equal(await allowed(query, { variables: { orderId: 2700 }, viewer: contact }), false);
  }
  assert.equal(await allowed(QUOTE_PDF, { variables: { quoteId: 2700 }, viewer: contact }), false);
  const run = (input: Record<string, unknown>) => allowed(ORDERS, { variables: { input: { userId: [73], ...input } }, viewer: contact });
  // What the account pages send: the useOrders default (orders), QUOTATION (quotes), REQUEST (quote requests).
  const page = { companyIds: [37], page: 1, offset: 10, term: '', channelIds: [621] };
  assert.equal(await run({ ...page, status: ['NEW', 'CONFIRMED', 'VALIDATED', 'ORDER'] }), true);
  assert.equal(await run({ ...page, status: ['QUOTATION'] }), true);
  assert.equal(await run({ ...page, status: ['REQUEST'] }), true);
  assert.equal(await run({ status: 'NEW' }), true);
  assert.equal(await run({}), false);
  assert.equal(await run({ status: null }), false);
  assert.equal(await run({ status: [] }), false);
  assert.equal(await run({ status: ['DRAFT_QUOTATION'] }), false);
  assert.equal(await run({ status: ['NEW', 'DRAFT_ORDER'] }), false);
  assert.equal(await run({ status: ['ARCHIVED'] }), false);
});

test('a nested order read, or one next to another root field, is an order read that is refused', async () => {
  const nested = [
    '{ viewer { __typename } order(orderId: 2621) { id } }',
    '{ order(orderId: 2621) { id } orders(input: { userId: [73] }) { itemsFound } }',
    '{ ... on Query { order(orderId: 2621) { id } } }',
    'query { ...Q } fragment Q on Query { order(orderId: 2621) { id } }',
    'query a { order(orderId: 2621) { id } } query b { order(orderId: 2621) { id } }',
    `${ORDER}\nquery other { viewer { __typename } }`,
  ];
  for (const query of nested) {
    assert.equal(readsOrders(doc(query)), true, query);
    assert.equal(await allowed(query, { variables: { orderId: 2621 }, viewer: contact, lastOrder: last(2621) }), false, query);
  }
});

test('an aliased order read is an order read, and is not the SDK document', async () => {
  const aliased = ORDER.replace('order(orderId:', 'x: order(orderId:');
  assert.notEqual(aliased, ORDER);
  assert.equal(readsOrders(doc(aliased)), true);
  assert.equal(await allowed(aliased, { variables: { orderId: 2621 }, viewer: contact }), false);
  assert.equal(await allowed('{ mine: orders(input: { userId: [71] }) { itemsFound } }', { viewer: contact }), false);
});

test('order revisions, addresses, shipments, tenders and payments are order reads that are never served', async () => {
  for (const query of [
    '{ orderAddresses(orderId: 2621) { id } }',
    '{ addressesByOrderId(orderId: 2621) { id } }',
    '{ orderAddress(id: 1, orderId: 2621) { id } }',
    '{ orderRevision(orderId: 2621, revisionNumber: 1) { snapshot { id } } }',
    '{ orderRevisions(input: { orderId: 2621 }) { itemsFound } }',
    '{ shipments(input: {}) { itemsFound } }',
    '{ shipment(id: "x") { orderId } }',
    '{ shipmentItems(input: {}) { itemsFound } }',
    '{ tender(orderId: 2621) { tenderId } }',
    '{ payment(searchBy: { orderId: 2621 }) { orderId amount userId } }',
    '{ payments(input: {}) { items { orderId amount } } }',
    '{ p: payments(input: {}) { itemsFound } }',
    'query { ...P } fragment P on Query { payment(searchBy: { orderId: 2621 }) { amount } }',
  ]) {
    assert.equal(readsOrders(doc(query)), true, query);
    assert.equal(await allowed(query, { viewer: contact, lastOrder: last(2621) }), false, query);
  }
  // The SDK's own order document stays served.
  assert.equal(await allowed(ORDER, { variables: { orderId: 2621 }, viewer: contact }), true);
});

test('mutations, the cartProcess order included, and other queries are not order reads', () => {
  const cartProcess = `mutation cartProcess($id: String!, $input: CartProcessInput!) {
    cartProcess(id: $id, input: $input) { cartOrderId order { id userId shipments { id } } }
  }`;
  assert.equal(readsOrders(doc(cartProcess)), false);
  assert.equal(readsOrders(doc('mutation { orderSetStatus(input: { orderId: 1, status: NEW }) { id } }')), false);
  assert.equal(readsOrders(doc('{ viewer { __typename } }')), false);
  // A fragment spread twice, or cyclic, is walked once.
  assert.equal(readsOrders(doc('query { viewer { ...V ...V } } fragment V on IBaseUser { ...V __typename }')), false);
});

test('a mutation is never served as an order read', async () => {
  assert.equal(await allowed('mutation { order(orderId: 2621) { id } }', { viewer: contact, lastOrder: last(2621) }), false);
});
