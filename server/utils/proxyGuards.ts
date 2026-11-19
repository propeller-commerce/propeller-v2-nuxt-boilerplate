import {
  Kind,
  visit,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from 'graphql';
import { COST_FIELDS } from './hidePrices.ts';

/** Document checks for /api/graphql, plus the portal-mode price rule shared with the SSR fetchers. */

export const MAX_BODY_BYTES = 100 * 1024; // large bulk queries fit
export const MAX_QUERY_DEPTH = 12; // the SDK's deepest document is checked in the test

/**
 * Selection-set nesting of the deepest operation, fragments expanded (the top level is 1). Counted
 * on the parsed document, so string literals and comments can't hide braces from it as they can
 * from propeller-next's brace counter. A fragment cycle (invalid anyway) counts as infinitely deep.
 */
export function queryDepth(doc: DocumentNode): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of doc.definitions) if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const setDepth = (set: SelectionSetNode): number => {
    let max = 0;
    for (const sel of set.selections) {
      if (sel.kind === Kind.FIELD) max = Math.max(max, sel.selectionSet ? setDepth(sel.selectionSet) : 0);
      else if (sel.kind === Kind.INLINE_FRAGMENT) max = Math.max(max, setDepth(sel.selectionSet) - 1);
      else max = Math.max(max, spreadDepth(sel.name.value) - 1);
    }
    return 1 + max;
  };
  const spreadDepth = (name: string): number => {
    const known = memo.get(name);
    if (known !== undefined) return known;
    const fragment = fragments.get(name);
    if (!fragment) return 1;
    if (visiting.has(name)) return Infinity;
    visiting.add(name);
    const depth = setDepth(fragment.selectionSet);
    visiting.delete(name);
    memo.set(name, depth);
    return depth;
  };

  let max = 0;
  for (const def of doc.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) max = Math.max(max, setDepth(def.selectionSet));
  }
  return max;
}

/**
 * The aliases the storefront's own documents use, as `alias:field`: the installed SDK's (checked
 * against every SDK document in tests/server/sdkDocuments.test.ts) plus vue-ui's machines query
 * (`machine_<n>: machine(...)`).
 */
export const SDK_ALIASES: ReadonlySet<string> = new Set(['urlId:categoryId']);
const isOwnAlias = (alias: string, field: string) =>
  SDK_ALIASES.has(`${alias}:${field}`) || (field === 'machine' && /^machine_\d{1,3}$/.test(alias));

export interface DocumentGuards {
  /** `__schema` / `__type` anywhere (the storefront never inspects the schema; `__typename` is fine). */
  introspection: boolean;
  /**
   * An alias the storefront's own documents don't use. hidePrices works by key name, so any alias
   * can carry prices past it: on a price field (`p: price`), or into a key it keeps
   * (`priceData { per: list }`, `priceData: products { per: items { price } }`).
   */
  foreignAlias: boolean;
  /**
   * A price filter or PRICE sort the proxy can't strip from the variables: `price: {…}` or
   * `price: $v` inside an input object, a `PRICE` enum literal, or a sort `field: $v`. Counting
   * results per price range reveals exact prices. The SDK passes whole inputs as one variable,
   * which withoutPriceFilters cleans instead.
   */
  inlinePriceFilter: boolean;
  /**
   * An alias that could carry a cost past the key-name strip (withoutCostPrices): on a COST_FIELDS
   * field or `discount`, or on any field inside a discount record (selection or fragment).
   */
  costAlias: boolean;
}

const DISCOUNT_TYPES = new Set(['IDiscount', 'BulkCostPrice', 'BulkPrice', 'Discount']);

/** One visit of an already parsed document for every guard. */
export function inspectDocument(doc: DocumentNode): DocumentGuards {
  const result: DocumentGuards = { introspection: false, foreignAlias: false, inlinePriceFilter: false, costAlias: false };
  let inDiscount = 0; // `discount` selections entered
  let discountFragment = false;
  visit(doc, {
    [Kind.FIELD]: {
      enter(node) {
        const name = node.name.value;
        if (name === '__schema' || name === '__type') result.introspection = true;
        if (node.alias && !isOwnAlias(node.alias.value, name)) result.foreignAlias = true;
        if (node.alias && (COST_FIELDS.has(name) || name === 'discount' || inDiscount || discountFragment)) {
          result.costAlias = true;
        }
        if (name === 'discount') inDiscount++;
      },
      leave(node) {
        if (node.name.value === 'discount') inDiscount--;
      },
    },
    [Kind.FRAGMENT_DEFINITION]: {
      enter(node) {
        discountFragment = DISCOUNT_TYPES.has(node.typeCondition.name.value);
      },
      leave() {
        discountFragment = false;
      },
    },
    [Kind.OBJECT_FIELD](node) {
      const name = node.name.value;
      const kind = node.value.kind;
      if (name === 'price' && (kind === Kind.OBJECT || kind === Kind.VARIABLE)) result.inlinePriceFilter = true;
      if (name === 'field' && kind === Kind.VARIABLE) result.inlinePriceFilter = true;
    },
    [Kind.ENUM](node) {
      if (node.value === 'PRICE') result.inlinePriceFilter = true;
    },
  });
  return result;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isPriceFilter = (key: string, value: unknown) => key === 'price' && isRecord(value);
// A sort object in a list, or alone (GraphQL coerces a single object into the list).
const isPriceSort = (value: unknown) => isRecord(value) && value.field === 'PRICE';

/** Whether variables carry a price filter (`price: {from, to}`) or a sort on PRICE, at any depth. */
export function hasPriceFilter(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => isPriceSort(v) || hasPriceFilter(v));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([k, v]) => isPriceFilter(k, v) || isPriceSort(v) || hasPriceFilter(v));
}

/** A copy of variables without price filters and PRICE sorts, for viewers who may not see prices. */
export function withoutPriceFilters(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => !isPriceSort(v)).map(withoutPriceFilters);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k, v]) => !isPriceFilter(k, v) && !isPriceSort(v))
      .map(([k, v]) => [k, withoutPriceFilters(v)]),
  );
}

// ── Portal mode ─────────────────────────────────────────────────────────────

export function normalizePortalMode(raw: unknown): string {
  const lower = String(raw ?? '').trim().toLowerCase();
  if (lower === 'semiclosed') return 'semi-closed';
  return lower || 'open';
}

/**
 * The strictest of the configured modes. The server reads BOILERPLATE_PORTAL_MODE, the pages
 * NUXT_PUBLIC_PORTAL_MODE; a shop that set only one of them must not serve prices the pages hide.
 */
export function strictestPortalMode(...modes: unknown[]): string {
  const normalized = modes.map(normalizePortalMode);
  return normalized.find((m) => m === 'closed') ?? normalized.find((m) => m === 'semi-closed') ?? 'open';
}

/** Prices are for logged-in viewers only in these modes; `open` shops skip the whole gate. */
export function priceGateActive(portalMode: string): boolean {
  return portalMode === 'semi-closed' || portalMode === 'closed';
}

/** A Contact or Customer viewer (as the SSR viewer lookup returns it); a bare `User` is a guest. */
export function isPriceViewer(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false;
  const u = user as { contactId?: unknown; customerId?: unknown };
  const id = (v: unknown) => typeof v === 'number' && v > 0;
  return id(u.contactId) || id(u.customerId);
}

/** SSR rule (core-ui's isContentHidden misses `closed` and trusts any non-null viewer). */
export function pricesHiddenFor(portalMode: string, user: unknown): boolean {
  return priceGateActive(portalMode) && !isPriceViewer(user);
}

// ── Catalog listings (SSR fetchers) ─────────────────────────────────────────

export interface ListingPriceOptions {
  sortField?: string;
  priceFilterMin?: number;
  priceFilterMax?: number;
}

/**
 * The listing options a viewer may use: when prices are hidden for them, no price range and no
 * PRICE sort, since counting results per range (itemsFound) or reading the order reveals exact
 * prices. Applied before the anonymous cache key is computed (security review M2).
 */
export function listingForViewer<T extends ListingPriceOptions>(opts: T, pricesHidden: boolean): T {
  if (!pricesHidden) return opts;
  return {
    ...opts,
    priceFilterMin: undefined,
    priceFilterMax: undefined,
    sortField: opts.sortField === 'PRICE' ? undefined : opts.sortField,
  };
}
