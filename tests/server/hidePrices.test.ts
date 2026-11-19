import test from 'node:test';
import assert from 'node:assert/strict';
import { forPriceViewer, hidePrices, PRICE_FIELDS, withoutCostPrices } from '../../server/utils/hidePrices.ts';

const product = {
  productId: 417,
  name: [{ language: 'NL', value: 'M96 SMART' }],
  price: { list: 58, cost: 6, net: 70.18, gross: 58, discount: null },
  priceData: { per: 'ITEM', list: 58, costPrices: [{ value: 6 }], suggested: 60, store: 59, display: 'DEFAULT' },
  bulkPrices: [{ net: 65, gross: 54 }],
  surcharges: [{ id: 1, value: 2 }],
  bundles: [{ id: 3, price: { net: 100, gross: 82 }, items: [{ product: { price: { net: 1 } } }] }],
  inventory: { totalQuantity: 4 },
};

test('drops every price field and keeps the rest', () => {
  const out = hidePrices(product);
  assert.equal(out.price, null);
  assert.deepEqual(out.priceData, { per: 'ITEM', display: 'DEFAULT' });
  assert.deepEqual(out.bulkPrices, []);
  assert.deepEqual(out.surcharges, []);
  assert.equal(out.bundles[0].price, null);
  assert.equal(out.bundles[0].items[0].product.price, null);
  assert.equal(out.productId, 417);
  assert.deepEqual(out.name, product.name);
  assert.deepEqual(out.inventory, product.inventory);
});

test('no price number survives anywhere in the output', () => {
  const json = JSON.stringify(hidePrices(product));
  for (const n of ['58', '70.18', '"cost"', '"suggested"', '"store"', '"gross"', '"net"']) {
    assert.equal(json.includes(n), false, n);
  }
});

test('listing min/max price and nested products are cleared', () => {
  const listing = {
    itemsFound: 2,
    minPrice: 4,
    maxPrice: 900,
    items: [{ ...product }, { clusterId: 9, defaultProduct: { ...product }, options: [{ products: [{ ...product }] }] }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = hidePrices(listing) as any;
  assert.equal(out.minPrice, null);
  assert.equal(out.maxPrice, null);
  assert.equal(out.itemsFound, 2);
  assert.equal(out.items[0].price, null);
  assert.equal(out.items[1].defaultProduct.price, null);
  assert.equal(out.items[1].options[0].products[0].price, null);
});

test('does not mutate its input', () => {
  const input = structuredClone(product);
  hidePrices(input);
  assert.deepEqual(input, product);
});

test('passes through null and primitives', () => {
  assert.equal(hidePrices(null), null);
  assert.equal(hidePrices(5), 5);
});

test('cart and order amounts are cleared too (they use other field names)', () => {
  const cart = {
    cartId: 'c1',
    items: [{ productId: 1, quantity: 2, priceNet: 10, totalPrice: 24.2, totalPriceNet: 20, sum: 24.2, sumNet: 20, totalSum: 24.2, totalSumNet: 20 }],
    total: { subTotal: 24.2, subTotalNet: 20, totalNet: 20, totalGross: 24.2, discountNet: 0, tax: 4.2 },
    taxLevels: [{ taxPercentage: 21, price: 4.2 }],
  };
  const order = {
    id: 9,
    items: [{ priceTotal: 10, priceTotalNet: 8, customerPrice: 8, originalPrice: 9, costPrice: 5, originalGross: 9, originalNet: 8 }],
    total: { gross: 24.2, net: 20, discountValue: 1 },
  };
  const out = JSON.stringify([hidePrices(cart), hidePrices(order)]);
  // Only ids, quantities and the tax percentage are numbers that may survive.
  const numbers = (out.match(/:\s*-?\d+(\.\d+)?/g) || []).map((m) => Number(m.slice(1)));
  assert.deepEqual(numbers.sort((a, b) => a - b), [1, 2, 9, 21]);
});

test('search, discount, margin, tax-level and payment amounts are cleared; totals objects are kept', () => {
  const out = hidePrices({
    items: [{ id: 1, effectivePrice: 18.46, marginAmount: 3, saleMarginPercentage: 10, costPrices: [{ price: 2 }] }],
    total: { totalGross: 10, totalTax: 2, subTotalGross: 12, discountPercentage: 5 },
    taxPercentages: [{ percentage: 21, total: 4.2 }],
    payment: { orderId: 9, amount: 24.2 },
  }) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(out.items[0].effectivePrice, null);
  assert.equal(out.items[0].marginAmount, null);
  assert.equal(out.items[0].saleMarginPercentage, null);
  assert.deepEqual(out.items[0].costPrices, []);
  assert.deepEqual(out.total, { totalGross: null, totalTax: null, subTotalGross: null, discountPercentage: null });
  assert.deepEqual(out.taxPercentages, [{ percentage: 21, total: null }]);
  assert.deepEqual(out.payment, { orderId: 9, amount: null });
});

test('every price-like number field in the SDK types is cleared or explicitly allowed', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = 'node_modules/@propeller-commerce/propeller-sdk-v2/dist/cjs/type/';
  // Counts, tax percentages, ids: not amounts.
  const allowed = new Set(['countTotal', 'taxPercentage', 'taxPercentageDecimal', 'totalBatches', 'totalCategories', 'totalClusters', 'totalCount', 'totalDocs', 'totalDocuments', 'totalHours', 'totalProcessed', 'totalProducts', 'totalQuantity']);
  const missing = new Set<string>();
  const files = readdirSync(dir).filter((f) => f.endsWith('.d.ts') && !f.includes('Input'));
  assert.ok(files.length > 100, 'SDK types found');
  for (const file of files) {
    for (const m of readFileSync(dir + file, 'utf8').matchAll(/^\s+([a-zA-Z]*(?:[Pp]rice|[Cc]ost|[Mm]argin|[Dd]iscount|[Tt]ax|[Tt]otal|[Aa]mount|[Ss]um|[Gg]ross|[Nn]et)[a-zA-Z]*)\??: number;/gm)) {
      if (!PRICE_FIELDS.has(m[1]!) && !allowed.has(m[1]!)) missing.add(`${file}:${m[1]}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('priceData keeps its display keys only as scalars: an alias into them carries nothing', () => {
  const smuggled = {
    priceData: {
      per: { list: 58, costPrices: [{ value: 6 }] },
      display: [{ price: { net: 3 } }],
      bulkPriceDiscountType: { gross: 1 },
      defaultTaxCode: 'H',
    },
    // `priceData: products(...) { per: items { ... } }`
    other: { priceData: { per: [{ sku: 'A', price: { net: 1, gross: 2 }, priceData: { list: 9 } }], itemsFound: 1 } },
  };
  const out = hidePrices(smuggled) as typeof smuggled;
  assert.deepEqual(out.priceData, { defaultTaxCode: 'H' });
  assert.deepEqual(out.other.priceData, {});
  assert.deepEqual(hidePrices({ priceData: { per: 'ITEM', display: null } }), { priceData: { per: 'ITEM', display: null } });
  assert.deepEqual(hidePrices({ priceData: { per: 1 } }), { priceData: { per: 1 } });
  assert.equal(JSON.stringify(out).match(/\d/g)?.length ?? 0, 0, 'no amount survives');
});

test('withoutCostPrices drops every costPrice key of an order read, at any depth, and nothing else', () => {
  const order = {
    data: {
      order: {
        id: 2621,
        total: { gross: 10, net: 12.1 },
        items: [
          { id: 1, price: 5, costPrice: 3, product: { productId: 7, costPrice: 2 } },
          { id: 2, price: 5, costPrice: null, childItems: [{ id: 3, costPrice: 1, price: 1 }] },
        ],
      },
    },
  };
  assert.deepEqual(withoutCostPrices(order), {
    data: {
      order: {
        id: 2621,
        total: { gross: 10, net: 12.1 },
        items: [
          { id: 1, price: 5, product: { productId: 7 } },
          { id: 2, price: 5, childItems: [{ id: 3, price: 1 }] },
        ],
      },
    },
  });
  assert.ok(!JSON.stringify(withoutCostPrices({ data: { orders: { items: [order.data.order] } } })).includes('costPrice'));
  assert.equal(withoutCostPrices(null), null);
  assert.equal(withoutCostPrices('x'), 'x');
});

// The storefront key's catalog answer (SDK products / product documents) as an open-shop guest gets it.
const catalogProduct = (productId: number) => ({
  productId,
  sku: `SKU-${productId}`,
  price: { net: 10, gross: 12.1, list: 10, cost: 4.2, discount: { value: 1, quantityFrom: 1, discountType: 'PERCENTAGE' } },
  priceData: { per: 'ITEM', display: 'FROM_FOR', costPrices: [{ quantityFrom: 1, value: 4.2 }] },
  inventory: { totalQuantity: 5, balance: [{ quantity: 5, warehouseId: 1, costPrice: 4.2 }] },
  cluster: { products: [{ productId: productId + 1, priceData: { costPrices: [{ value: 1 }] } }] },
});
const withoutCost = (productId: number) => ({
  productId,
  sku: `SKU-${productId}`,
  price: { net: 10, gross: 12.1, list: 10, discount: { quantityFrom: 1, discountType: 'PERCENTAGE' } },
  priceData: { per: 'ITEM', display: 'FROM_FOR' },
  inventory: { totalQuantity: 5, balance: [{ quantity: 5, warehouseId: 1 }] },
  cluster: { products: [{ productId: productId + 1, priceData: {} }] },
});

test('proxy: catalog answers lose price.cost, priceData.costPrices and inventory.balance.costPrice for every viewer, nothing else changes', () => {
  const answer = { data: { products: { itemsFound: 2, items: [catalogProduct(7), catalogProduct(9)] } } };
  const expected = { data: { products: { itemsFound: 2, items: [withoutCost(7), withoutCost(9)] } } };
  // Open-shop guest and verified viewer: prices stay, cost prices go.
  assert.deepEqual(forPriceViewer(answer, true), expected);
  // Gated guest: cost prices go, prices are hidden as before.
  const gated = forPriceViewer(answer, false);
  assert.ok(!JSON.stringify(gated).includes('costPrice'));
  assert.deepEqual(gated, hidePrices(expected));
  // An answer without cost prices comes back equal.
  assert.deepEqual(forPriceViewer(expected, true), expected);
  // A COST_PRICE_PLUS tier: gross / (1 + discount.value / 100) is the cost, so the discount record
  // keeps no amount; what vue-ui's tier table reads stays. A numeric discount (cart, order) stays.
  const tier = {
    discountType: 'COST_PRICE_PLUS',
    gross: 78,
    discount: { value: 30, quantityFrom: 10, validFrom: null, validTo: null, priceId: 5, product: { productId: 1 } },
  };
  assert.deepEqual(forPriceViewer({ bulkPrices: [tier] }, true), {
    bulkPrices: [{ discountType: 'COST_PRICE_PLUS', gross: 78, discount: { quantityFrom: 10, validFrom: null, validTo: null, priceId: 5 } }],
  });
  assert.deepEqual(forPriceViewer({ cart: { total: { discount: 5 }, items: [{ discount: 1 }] } }, true), {
    cart: { total: { discount: 5 }, items: [{ discount: 1 }] },
  });
  // A root bulkCostPrices answer is dropped whole.
  assert.deepEqual(forPriceViewer({ data: { bulkCostPrices: { items: [{ value: 3 }] } } }, true), { data: {} });
});

test('SSR fetchers: a product and a listing result lose their cost prices before the page (and the cache) gets them', () => {
  assert.deepEqual(forPriceViewer(catalogProduct(7), true), withoutCost(7));
  const listing = { categoryId: 13, products: { items: [catalogProduct(7)], itemsFound: 1 } };
  assert.deepEqual(forPriceViewer(listing, true), { categoryId: 13, products: { items: [withoutCost(7)], itemsFound: 1 } });
});
