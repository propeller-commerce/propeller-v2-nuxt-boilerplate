import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse, visit } from 'graphql';
import {
  checkoutMutationAllowed,
  classifyOperation,
  CONTACT_REGISTER_DOCUMENT_HASH,
  ORDER_EDITOR_DOCUMENT_HASHES,
  orderReadAllowed,
  readsOrders,
  singleTopLevelField,
  type ClassifyInput,
  type LastOrder,
} from '../../server/utils/orderEditorRouting.ts';
import { documentHash } from '../../server/utils/registrationRouting.ts';
import type { Viewer } from '../../server/utils/viewer.ts';
import { inspectDocument, MAX_QUERY_DEPTH, queryDepth, SDK_ALIASES } from '../../server/utils/proxyGuards.ts';

// The installed SDK's own documents: what the storefront actually sends through /api/graphql.
const OPS = 'node_modules/@propeller-commerce/propeller-sdk-v2/dist/esm/generated/operations/';
const sdkDocument = async (name: string): Promise<string> =>
  (await import(pathToFileURL(`${process.cwd()}/${OPS}${name}.js`).href)).document;

const ctx = (query: string, extra: Partial<ClassifyInput> = {}): ClassifyInput => ({
  doc: parse(query, { noLocation: true }),
  single: singleTopLevelField(parse(query, { noLocation: true })),
  variables: {},
  isAnonymous: true,
  orderEditorOptIn: false,
  lastOrder: null,
  ...extra,
});

test('the SDK checkout mutations elevate only for the last order; passwordResetLink never', async () => {
  for (const name of ['orderSetStatus', 'triggerQuoteSendRequest', 'triggerOrderSendConfirm']) {
    const doc = await sdkDocument(name);
    const lastOrder = { orderId: 9, used: '' };
    assert.equal(classifyOperation(ctx(doc, { variables: { input: { orderId: 9, status: 'NEW' } }, lastOrder })).key, 'order-editor', name);
    assert.equal(classifyOperation(ctx(doc, { variables: { input: { orderId: 8, status: 'NEW' } }, lastOrder })).key, 'general', name);
  }
  const reset = await sdkDocument('passwordResetLink');
  assert.equal(classifyOperation(ctx(reset, { variables: { input: { email: 'x@example.test' } } })).key, 'general');
  assert.equal(classifyOperation(ctx(reset, { isAnonymous: false, lastOrder: { orderId: 9, used: '' } })).key, 'general');
});

test("exactly the SDK's order, revision, address, shipment, tender and payment queries read orders; cartProcess does not", async () => {
  const reading: string[] = [];
  for (const name of readdirSync(`${process.cwd()}/${OPS}`).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3))) {
    const doc = await sdkDocument(name).catch(() => undefined);
    if (typeof doc === 'string' && readsOrders(parse(doc, { noLocation: true }))) reading.push(name);
  }
  assert.deepEqual(reading.sort(), [
    'order',
    'orderAddress',
    'orderAddresses',
    'orderGetPDF',
    'orderRevision',
    'orderRevisions',
    'orders',
    'payment',
    'payments',
    'quoteGetPDF',
    'shipment',
    'shipmentItem',
    'shipmentItems',
    'shipments',
    'tender',
  ]);
});

test('the SDK order reads are served to their owner and the guest last order only', async () => {
  const contact: Viewer = { type: 'Contact', userId: 73, companyIds: [37], managerOf: [] };
  const allowed = async (name: string, variables: unknown, viewer: Viewer | null, lastOrder: LastOrder | null = null) => {
    const doc = parse(await sdkDocument(name));
    return orderReadAllowed({
      doc,
      single: singleTopLevelField(doc),
      variables,
      viewer,
      lastOrder,
      orderOwner: async (orderId) => ({ userId: orderId === 9 ? 73 : 71, status: 'NEW' }),
    });
  };
  assert.equal(await allowed('order', { orderId: 9 }, null, { orderId: 9, used: '' }), true);
  assert.equal(await allowed('order', { orderId: 8 }, null, { orderId: 9, used: '' }), false);
  assert.equal(await allowed('order', { orderId: 9, language: 'NL' }, contact), true);
  assert.equal(await allowed('order', { orderId: 8 }, contact), false);
  assert.equal(await allowed('orderGetPDF', { orderId: 9 }, contact), true);
  assert.equal(await allowed('quoteGetPDF', { quoteId: 9 }, contact), true);
  assert.equal(await allowed('quoteGetPDF', { quoteId: 8 }, contact), false);
  // vue-ui useOrders.fetchOrders: the session's own id and company.
  const input = { status: ['NEW'], userId: [73], companyIds: [37], page: 1, offset: 10, term: '', channelIds: [621] };
  assert.equal(await allowed('orders', { input }, contact), true);
  assert.equal(await allowed('orders', { input: { ...input, userId: [71] } }, contact), false);
  assert.equal(await allowed('orders', { input }, null), false);
});

test("checkout mutations run elevated only as the SDK's own documents (hashes match the installed SDK)", async () => {
  const names = ['orderSetStatus', 'triggerQuoteSendRequest', 'triggerOrderSendConfirm'];
  const docs = await Promise.all(names.map(async (n) => parse(await sdkDocument(n), { noLocation: true })));
  assert.deepEqual(new Set(docs.map(documentHash)), ORDER_EDITOR_DOCUMENT_HASHES);
  for (const [i, doc] of docs.entries()) {
    assert.equal(checkoutMutationAllowed(doc, true), true, names[i]);
    // Not elevated (another order, spent, not the viewer's quote): refused, never the storefront key.
    assert.equal(checkoutMutationAllowed(doc, false), false, names[i]);
  }
  for (const custom of [
    'mutation($input: OrderSetStatusInput!) { orderSetStatus(input: $input) { id company { contacts { items { email } } } } }',
    'mutation($input: OrderSetStatusInput!) { x: orderSetStatus(input: $input) { id } }',
    'mutation($input: TriggerQuoteSendRequestEventInput!) { triggerQuoteSendRequest(input: $input) __typename }',
    'mutation($input: X!) { triggerOrderSendConfirm(input: $input) }',
    'mutation($input: X!, $c: String!) { orderSetStatus(input: $input) { id } cartProcess(id: $c, input: {}) { cartOrderId } }',
  ]) {
    assert.equal(checkoutMutationAllowed(parse(custom), true), false, custom);
  }
  // Every other document is left to the other guards.
  for (const name of ['cartProcess', 'order', 'viewer', 'contactRegister']) {
    assert.equal(checkoutMutationAllowed(parse(await sdkDocument(name)), false), true, name);
  }
});

test('the SDK contactRegister (pinned by hash) needs the opt-in, a session and then the manager check', async () => {
  const doc = await sdkDocument('contactRegister');
  assert.equal(documentHash(parse(doc, { noLocation: true })), CONTACT_REGISTER_DOCUMENT_HASH);
  const variables = { contactRegisterInput: { email: 'x@example.test', parentId: 37 } };
  assert.equal(classifyOperation(ctx(doc, { variables })).key, 'general');
  assert.equal(classifyOperation(ctx(doc, { variables, orderEditorOptIn: true })).key, 'general');
  assert.deepEqual(classifyOperation(ctx(doc, { variables, isAnonymous: false, orderEditorOptIn: true })), { key: 'manager', companyId: 37 });
  // The same field with an extra selection (or an alias) is public self-registration, not elevated.
  const custom = doc.replace('contactRegister(input:', 'x: contactRegister(input:');
  assert.notEqual(custom, doc);
  assert.equal(classifyOperation(ctx(custom, { variables, isAnonymous: false, orderEditorOptIn: true })).key, 'general');
  const extra = doc.replace(/contactRegister\(input: \$contactRegisterInput\) \{/, '$& contact { company { contacts { items { email } } } }');
  assert.notEqual(extra, doc);
  assert.equal(classifyOperation(ctx(extra, { variables, isAnonymous: false, orderEditorOptIn: true })).key, 'general');
});

test('the SDK cart and viewer documents never elevate', async () => {
  for (const name of ['cartProcess', 'viewer']) {
    const doc = await sdkDocument(name);
    assert.equal(classifyOperation(ctx(doc, { isAnonymous: false, lastOrder: { orderId: 9, used: '' } })).key, 'general', name);
  }
});

test('no SDK document trips a proxy guard, so the shop\'s own queries are never refused', async () => {
  const names = readdirSync(`${process.cwd()}/${OPS}`).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
  assert.ok(names.length > 100, 'SDK operations found');
  const offenders: string[] = [];
  let deepest = 0;
  for (const name of names) {
    const doc = await sdkDocument(name).catch(() => undefined);
    if (typeof doc !== 'string') continue;
    const ast = parse(doc, { noLocation: true });
    const guards = inspectDocument(ast);
    const depth = queryDepth(ast);
    deepest = Math.max(deepest, depth);
    if (guards.introspection || guards.foreignAlias || guards.inlinePriceFilter || guards.costAlias || depth > MAX_QUERY_DEPTH) {
      offenders.push(`${name} (depth ${depth})`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(deepest > 3, `depth is measured (deepest SDK document: ${deepest})`);
});

test('no SDK document aliases a cost field, so refusing those aliases never blocks the shop', async () => {
  const names = readdirSync(`${process.cwd()}/${OPS}`).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
  const aliased: string[] = [];
  for (const name of names) {
    const doc = await sdkDocument(name).catch(() => undefined);
    if (typeof doc === 'string' && inspectDocument(parse(doc, { noLocation: true })).costAlias) aliased.push(name);
  }
  assert.deepEqual(aliased, []);
});

test('SDK_ALIASES is exactly the set of aliases the installed SDK documents use', async () => {
  const names = readdirSync(`${process.cwd()}/${OPS}`).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
  const used = new Set<string>();
  for (const name of names) {
    const doc = await sdkDocument(name).catch(() => undefined);
    if (typeof doc !== 'string') continue;
    visit(parse(doc, { noLocation: true }), {
      Field(node) {
        if (node.alias) used.add(`${node.alias.value}:${node.name.value}`);
      },
    });
  }
  assert.deepEqual([...used].sort(), [...SDK_ALIASES].sort());
});
