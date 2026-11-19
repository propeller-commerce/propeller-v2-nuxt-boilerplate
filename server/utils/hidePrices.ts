/**
 * Removes price data from catalog, cart, order and search responses, for visitors a semi-closed or
 * closed shop must not show prices to. Applied server-side (SSR fetchers and the /api/graphql
 * proxy) so prices never reach the browser. Matches by key name, so the proxy refuses aliases on
 * these fields (`PRICE_FIELDS`, see server/utils/priceGate.ts).
 */

const NULLED = new Set([
  'price',
  'minPrice',
  'maxPrice',
  // Cart and order amounts (SDK cart*/order* documents).
  'priceNet',
  'priceTotal',
  'priceTotalNet',
  'totalPrice',
  'totalPriceNet',
  'customerPrice',
  'originalPrice',
  'originalGross',
  'originalNet',
  'costPrice',
  'sum',
  'sumNet',
  'totalSum',
  'totalSumNet',
  'subTotal',
  'subTotalNet',
  'totalNet',
  'totalGross',
  'gross',
  'net',
  'tax',
  'discount',
  'discountNet',
  'discountValue',
  // Search results, discounts, margins and costs (checked against the SDK types in the test).
  'effectivePrice',
  'discountGross',
  'discountPercentage',
  'discountPercentageSum',
  'customerDiscountPercentage',
  'totalDiscountPercentage',
  'totalDiscountPercentageSum',
  'subTotalGross',
  'totalTax',
  'shippingCost',
  'marginAmount',
  'marginPercentage',
  'saleMarginAmount',
  'saleMarginAmountSum',
  'saleMarginPercentage',
  'saleMarginPercentageSum',
  'attributedSaleDiscount',
  'attributedSaleDiscountSum',
  'attributedSaleMargin',
  'attributedSaleMarginSum',
]);
// Amounts when numeric (tax levels, payments); `total` is also the cart totals object, which is recursed into.
const NULLED_IF_NUMBER = new Set(['total', 'amount', 'cost']);
const EMPTIED = new Set(['bulkPrices', 'surcharges', 'costPrices']);
/** Every response key hidePrices clears; an alias on one of these fields would get around it. */
export const PRICE_FIELDS: ReadonlySet<string> = new Set([...NULLED, ...NULLED_IF_NUMBER, ...EMPTIED, 'priceData']);
// priceData keys that only configure display, not amounts: enums as strings, `per` as a scalar.
// Anything else under them (an object or list aliased into the key) is dropped, not recursed.
const PRICE_DATA_ENUMS = new Set(['display', 'bulkPriceDiscountType', 'defaultTaxCode']);
const keptPriceData = (key: string, value: unknown): boolean =>
  value === null ||
  (key === 'per' ? typeof value === 'string' || typeof value === 'number' : PRICE_DATA_ENUMS.has(key) && typeof value === 'string');

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (NULLED.has(key) || (NULLED_IF_NUMBER.has(key) && typeof child === 'number')) out[key] = null;
    else if (EMPTIED.has(key)) out[key] = [];
    else if (key === 'priceData' && child && typeof child === 'object') {
      out[key] = Object.fromEntries(
        Object.entries(child).filter(([k, v]) => (k === 'per' || PRICE_DATA_ENUMS.has(k)) && keptPriceData(k, v)),
      );
    } else out[key] = strip(child);
  }
  return out;
}

/** A copy of `data` with every price field cleared. */
export function hidePrices<T>(data: T): T {
  return strip(data) as T;
}

// The merchant's cost prices: the storefront key returns them in catalog and cart answers
// (price.cost, priceData.costPrices, inventory.balance.costPrice; Query.bulkCostPrices), the
// order-editor key in order reads. No visitor or buyer gets them, logged in or not. `cost` is only
// Price.cost / ProductPrice.cost in the schema. The proxy refuses aliases on these fields.
export const COST_FIELDS: ReadonlySet<string> = new Set(['costPrice', 'costPrices', 'cost', 'bulkCostPrices']);

// ProductPrice.discount (IDiscount: BulkCostPrice, BulkPrice, Discount) is the only object-valued
// `discount`; on a COST_PRICE_PLUS price its `value` is the markup on cost, so value and gross
// give the cost. It keeps only what vue-ui's tier table reads and the records' ids.
const DISCOUNT_KEPT = new Set([
  'id',
  'createdAt',
  'lastModifiedAt',
  'quantityFrom',
  'validFrom',
  'validTo',
  'priceId',
  'pricesheetId',
  'productId',
  'categoryId',
  'priceGroup',
  'discountType',
  '__typename',
]);

/**
 * A copy of a response without any COST_FIELDS key, at any depth, and with discount records
 * reduced to DISCOUNT_KEPT (no amounts).
 */
export function withoutCostPrices(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCostPrices);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !COST_FIELDS.has(key))
      .map(([key, child]) => [
        key,
        key === 'discount' && child && typeof child === 'object' && !Array.isArray(child)
          ? Object.fromEntries(Object.entries(child).filter(([k, v]) => DISCOUNT_KEPT.has(k) && (v === null || typeof v !== 'object')))
          : withoutCostPrices(child),
      ]),
  );
}

/**
 * What a viewer gets of a GraphQL answer or SSR fetch result (the proxy and the SSR fetchers):
 * never cost prices, and no prices at all when `seesPrices` is false.
 */
export function forPriceViewer<T>(value: T, seesPrices: boolean): T {
  const clean = withoutCostPrices(value) as T;
  return seesPrices ? clean : hidePrices(clean);
}
