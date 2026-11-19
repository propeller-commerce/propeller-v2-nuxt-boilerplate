import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'graphql';
import {
  hasPriceFilter,
  inspectDocument,
  isPriceViewer,
  listingForViewer,
  MAX_QUERY_DEPTH,
  priceGateActive,
  pricesHiddenFor,
  queryDepth,
  SDK_ALIASES,
  strictestPortalMode,
  withoutPriceFilters,
} from '../../server/utils/proxyGuards.ts';

const inspect = (query: string) => inspectDocument(parse(query));
const depth = (query: string) => queryDepth(parse(query));
const none = { introspection: false, foreignAlias: false, inlinePriceFilter: false, costAlias: false };

test('introspection is found anywhere, __typename is fine', () => {
  assert.deepEqual(inspect('{ __schema { types { name } } }'), { ...none, introspection: true });
  assert.deepEqual(inspect('{ products { items { t: __type(name: "Product") { name } } } }'), { ...none, introspection: true, foreignAlias: true });
  assert.deepEqual(inspect('query { ...F } fragment F on Query { __schema { queryType { name } } }'), { ...none, introspection: true });
  assert.deepEqual(inspect('{ product(productId: 1) { __typename } }'), none);
});

test("every alias but the storefront's own is found, also inside fragments", () => {
  for (const query of [
    '{ products { items { ... on Product { p: price { gross } } } } }',
    'query { product(productId: 1) { ...F } } fragment F on Product { tiers: bulkPrices { net } }',
    '{ cart(id: "c") { t: total { totalGross } } }',
    '{ productSearch { items { e: effectivePrice } } }',
    '{ products { items { ... on Product { name: names { value } price { gross } } } } }',
    '{ a: product(productId: 1) { price { gross } } }',
    // Aliasing INTO keys hidePrices keeps (security review, 2026-11-18):
    '{ product(productId: 1) { priceData { per: list } } }',
    'query { priceData: products(input: { offset: 100, page: 1, term: "" }) { per: items { ... on Product { sku price { net gross } bulkPrices { net } priceData { list costPrices { value } } } } } }',
    '{ category(categoryId: 1) { urlId: name { value } } }',
    '{ machine_0: product(productId: 1) { price { gross } } }',
  ]) {
    assert.equal(inspect(query).foreignAlias, true, query);
  }
});

test("the storefront's own aliases pass: the SDK's urlId: categoryId and vue-ui's machine_<n>: machine", () => {
  assert.deepEqual([...SDK_ALIASES], ['urlId:categoryId']);
  assert.equal(inspect('{ category(categoryId: 1) { urlId: categoryId name { value } } }').foreignAlias, false);
  const machines = 'query RootMachines($source: String, $sourceId_0: String, $sourceId_1: String) { machine_0: machine(source: $source, sourceId: $sourceId_0) { id } machine_1: machine(source: $source, sourceId: $sourceId_1) { id } }';
  assert.equal(inspect(machines).foreignAlias, false);
  assert.equal(inspect('{ machine_x: machine(source: "a", sourceId: "b") { id } }').foreignAlias, true);
});

test('inline price filters and PRICE sorts are found; numeric prices and variables are not filters', () => {
  assert.equal(inspect('{ products(input: { price: { from: 76, to: 77 } }) { itemsFound } }').inlinePriceFilter, true);
  assert.equal(inspect('{ products(input: { sortInputs: [{ field: PRICE, order: ASC }] }) { itemsFound } }').inlinePriceFilter, true);
  assert.equal(inspect('mutation { cartAddItem(id: "c", input: { productId: 1, price: 5 }) { cartId } }').inlinePriceFilter, false);
  assert.equal(inspect('query q($input: ProductSearchInput) { products(input: $input) { itemsFound } }').inlinePriceFilter, false);
});

test('a price filter or sort field passed as its own variable is refused (security review M1)', () => {
  // (1) `price: $p` with { p: { from: 50, to: 60 } }: the variable is not named `price`.
  assert.equal(inspect('query q($p: ProductPriceFilterInput) { products(input: { productIds: [1], price: $p }) { itemsFound } }').inlinePriceFilter, true);
  // (2) `field: $f` with { f: "PRICE" }.
  assert.equal(inspect('query q($f: ProductSortField!) { products(input: { sortInputs: [{ field: $f, order: ASC }] }) { itemsFound } }').inlinePriceFilter, true);
});

test('a PRICE sort object outside a list is stripped too (security review M1)', () => {
  // (3) `sortInputs: $s` with a single object (list coercion).
  const single = { s: { field: 'PRICE', order: 'ASC' } };
  assert.equal(hasPriceFilter(single), true);
  assert.deepEqual(withoutPriceFilters(single), {});
  // (4) `$i` = { sortInputs: { field: "PRICE" } }.
  const nested = { i: { term: 'x', sortInputs: { field: 'PRICE' } } };
  assert.equal(hasPriceFilter(nested), true);
  assert.deepEqual(withoutPriceFilters(nested), { i: { term: 'x' } });
  assert.equal(hasPriceFilter({ i: { sortInputs: { field: 'NAME' } } }), false);
});

test('price filters and PRICE sorts are found in variables and removed from them', () => {
  const vars = {
    input: { term: 'x', price: { from: 76, to: 77 }, sortInputs: [{ field: 'PRICE', order: 'ASC' }, { field: 'NAME', order: 'ASC' }] },
  };
  assert.equal(hasPriceFilter(vars), true);
  assert.deepEqual(withoutPriceFilters(vars), { input: { term: 'x', sortInputs: [{ field: 'NAME', order: 'ASC' }] } });
  assert.equal(hasPriceFilter({ input: { term: 'x', price: null } }), false);
  assert.equal(hasPriceFilter({ input: { productId: 1, price: 5 } }), false);
  assert.deepEqual(withoutPriceFilters({ input: { productId: 1, price: 5 } }), { input: { productId: 1, price: 5 } });
  assert.equal(hasPriceFilter(undefined), false);
});

test('query depth: nesting with fragments expanded; inline fragments and strings add nothing', () => {
  assert.equal(depth('{ a }'), 1);
  assert.equal(depth('{ a { b { c } } }'), 3);
  assert.equal(depth('{ a { ... on A { b { c } } } }'), 3);
  assert.equal(depth('query { a { ...F } } fragment F on A { b { c { d } } }'), 4);
  assert.equal(depth('{ a(s: "}}}}}{{{{") { b } }'), 2);
  assert.equal(depth('query { a { ...F } } fragment F on A { b { ...F } }'), Infinity);
  const deep = `{ ${'a { '.repeat(MAX_QUERY_DEPTH)}b${' }'.repeat(MAX_QUERY_DEPTH)} }`;
  assert.equal(depth(deep), MAX_QUERY_DEPTH + 1);
});

test('portal mode: the strictest configured mode; the gate only in semi-closed and closed', () => {
  assert.equal(strictestPortalMode('open', 'open'), 'open');
  assert.equal(strictestPortalMode('open', 'semi-closed'), 'semi-closed');
  assert.equal(strictestPortalMode('semiclosed', undefined), 'semi-closed');
  assert.equal(strictestPortalMode(' Closed ', 'semi-closed'), 'closed');
  assert.equal(strictestPortalMode('', undefined), 'open');
  assert.equal(priceGateActive('open'), false);
  assert.equal(priceGateActive('semi-closed'), true);
  assert.equal(priceGateActive('closed'), true);
});

test('SSR rule: prices only for a Contact/Customer viewer in semi-closed and closed', () => {
  const contact = { contactId: 73 };
  const customer = { customerId: 5 };
  const guestUser = { __typename: 'User' };
  for (const mode of ['semi-closed', 'closed']) {
    assert.equal(pricesHiddenFor(mode, null), true, mode);
    assert.equal(pricesHiddenFor(mode, guestUser), true, `${mode}: an anonymous viewer object is still a guest`);
    assert.equal(pricesHiddenFor(mode, contact), false);
    assert.equal(pricesHiddenFor(mode, customer), false);
  }
  assert.equal(pricesHiddenFor('open', null), false);
  assert.equal(isPriceViewer({ contactId: '73' }), false);
});

test('listings: a semi-closed guest gets no price range and no PRICE sort; viewers and open shops do (M2)', () => {
  const asked = { page: 2, sortField: 'PRICE', sortOrder: 'ASC', priceFilterMin: 50, priceFilterMax: 60 };
  for (const mode of ['semi-closed', 'closed']) {
    const guest = listingForViewer(asked, pricesHiddenFor(mode, null));
    assert.deepEqual(guest, { page: 2, sortField: undefined, sortOrder: 'ASC', priceFilterMin: undefined, priceFilterMax: undefined });
  }
  assert.equal(listingForViewer({ sortField: 'NAME' }, true).sortField, 'NAME');
  assert.deepEqual(listingForViewer(asked, pricesHiddenFor('semi-closed', { contactId: 7 })), asked);
  assert.deepEqual(listingForViewer(asked, pricesHiddenFor('open', null)), asked);
});

test('an alias on a cost field is flagged in every mode; cost fields without an alias are not', () => {
  for (const query of [
    '{ products { items { ... on Product { priceData { a: costPrices { value } } } } } }',
    '{ products { items { ... on Product { inventory { balance { b: costPrice } } } } } }',
    '{ product(productId: 1) { price { c: cost } } }',
    '{ x: bulkCostPrices(input: {}) { items { value } } }',
    'query { products { items { ...P } } } fragment P on Product { price { c: cost } }',
  ]) {
    assert.equal(inspect(query).costAlias, true, query);
  }
  assert.equal(inspect('{ product(productId: 1) { price { cost } priceData { costPrices { value } } } }').costAlias, false);
  // Discount records: the markup in `value` must not be renamed past the strip either.
  for (const query of [
    '{ product(productId: 1) { price { d: discount { value } } } }',
    '{ product(productId: 1) { bulkPrices { discount { v: value } } } }',
    '{ product(productId: 1) { bulkPrices { discount { quantityFrom: value } } } }',
    '{ product(productId: 1) { bulkPrices { discount { ... on BulkPrice { q: value } } } } }',
    'query { product(productId: 1) { bulkPrices { discount { ...D } } } } fragment D on BulkPrice { q: value }',
  ]) {
    assert.equal(inspect(query).costAlias, true, query);
  }
  assert.equal(inspect('{ product(productId: 1) { bulkPrices { discount { value quantityFrom } } } }').costAlias, false);
  assert.equal(inspect('{ product(productId: 1) { names: name { nl: value } bulkPrices { discount { value } } } }').costAlias, false);
  assert.equal(inspect('{ products { items { ... on Product { cost: sku } } } }').costAlias, false);
});
