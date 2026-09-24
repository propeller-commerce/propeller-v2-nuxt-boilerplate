/**
 * Server-side SDK fetch helpers — port of propeller-next's
 * `fetchProduct` / `fetchCategory` / `fetchSearch` / `fetchCluster` /
 * `fetchMenu`. Each call routes through `cachedSdkFetch` so the anonymous
 * branch caches and tags, the authenticated branch bypasses.
 *
 * Image profiles, search-field boosts, sort defaults, and STOREFRONT_STATUSES
 * are kept identical to the React app so the SDK call shape matches and the
 * same backend webhook contract drives both caches.
 */

import {
  type Cluster,
  type ProductsResponse,
  type CategoryProductSearchInput,
  type ProductSortInput,
  type SearchFieldsInput,
  type FilterAvailableAttributeInput,
  type ProductTextFilterInput,
  type AttributeType,
  type ProductPriceFilterInput,
  type PriceCalculateProductInput,
  type UserBulkPriceProductInput,
  type ClusterConfigSetting,
  type Contact,
  type Customer,
  ProductStatus,
  ProductSortField,
  SortOrder,
  ProductSearchableField,
  channelService,
} from '@propeller-commerce/propeller-sdk-v2';
import { toPlain, type MenuCategory } from '@propeller-commerce/propeller-v2-vue-ui/shared';
import {
  imageSearchFilters,
  imageSearchFiltersGrid,
  imageVariantFiltersMedium,
  imageVariantFiltersLarge,
  channelId,
  baseCategoryId,
  configuration,
} from '../../app/utils/config';
import { cachedSdkFetch, stableStringify } from './cache';
import { ANONYMOUS_CACHE_TTL_SECONDS, TAG_CATALOG, tagFor } from './tags';
import type { ServerInfra } from './infra';

// We type the fetched shapes loosely (the SDK + Vue UI package use slightly
// divergent type names for the same data, depending on entry). Treat as
// untyped JSON for the wire-level helpers — the caller re-narrows.
export type FetchedProduct = unknown;
export type FetchedCategory = unknown;

const STOREFRONT_STATUSES: ProductStatus[] = [
  ProductStatus.A,
  ProductStatus.P,
  ProductStatus.T,
  ProductStatus.S,
];

const SEARCH_FIELDS: SearchFieldsInput[] = [
  {
    fieldNames: [
      ProductSearchableField.NAME,
      ProductSearchableField.KEYWORDS,
      ProductSearchableField.SKU,
      ProductSearchableField.CUSTOM_KEYWORDS,
    ],
    boost: 5,
  },
  {
    fieldNames: [
      ProductSearchableField.DESCRIPTION,
      ProductSearchableField.MANUFACTURER,
      ProductSearchableField.MANUFACTURER_CODE,
      ProductSearchableField.EAN_CODE,
      ProductSearchableField.BAR_CODE,
      ProductSearchableField.CLUSTER_ID,
      ProductSearchableField.CUSTOM_KEYWORDS,
      ProductSearchableField.PRODUCT_ID,
      ProductSearchableField.SHORT_DESCRIPTION,
      ProductSearchableField.SUPPLIER,
      ProductSearchableField.SUPPLIER_CODE,
    ],
    boost: 1,
  },
];

const FILTER_AVAILABLE_ATTRIBUTE_INPUT: FilterAvailableAttributeInput = {
  isSearchable: true,
};

export interface ListingFetchOptions {
  page?: number;
  offset?: number;
  sortField?: ProductSortField;
  sortOrder?: SortOrder;
  textFilters?: ProductTextFilterInput[];
  priceFilterMin?: number;
  priceFilterMax?: number;
  language?: string;
}

function resolveUserId(user: Contact | Customer | null, anonymousUserId?: number): number | undefined {
  if (!user) return anonymousUserId;
  if ('contactId' in user) return (user as Contact).contactId;
  if ('customerId' in user) return (user as Customer).customerId;
  return anonymousUserId;
}

// ── Channel-derived defaults (anonymous user + catalog root) ────────────────

/**
 * Defaults the storefront reads off the channel instead of hardcoding them:
 *  - `anonymousUserId` — the guest account anonymous price/product queries run
 *    as, so anonymous pricing follows the channel's configured account rather
 *    than the backend apikey default.
 *  - `catalogRootId` — the catalog root category, used as the base-category
 *    fallback when none is configured (`NUXT_PUBLIC_BASE_CATEGORY_ID` unset).
 */
export interface ChannelDefaults {
  anonymousUserId?: number;
  catalogRootId?: number;
}

// Channel config changes rarely; memo it for the anonymous catalog TTL so the
// `channel(channelId)` query doesn't run on every listing/menu render. Nitro
// has no `unstable_cache` equivalent that keys a plain function, so a
// module-level TTL cell stands in for propeller-next's `unstable_cache`.
// ponytail: reuses the (anonymous) `infra.client` the caller already holds
// instead of building a fresh client — createServerClient needs an H3Event
// these helpers don't get, and on a cache hit no client is touched at all.
let channelDefaultsCache: { value: ChannelDefaults; expires: number } | undefined;

async function getChannelDefaults(
  client: ServerInfra['client'],
  channelId: number
): Promise<ChannelDefaults> {
  const now = Date.now();
  if (channelDefaultsCache && channelDefaultsCache.expires > now) return channelDefaultsCache.value;
  try {
    const channel = await channelService(client).getChannel({ channelId });
    const value: ChannelDefaults = {
      anonymousUserId: channel?.anonymousUserId ?? undefined,
      catalogRootId: channel?.catalogRootId ?? undefined,
    };
    channelDefaultsCache = { value, expires: now + ANONYMOUS_CACHE_TTL_SECONDS * 1000 };
    return value;
  } catch (cause) {
    // Rethrow with context — never swallow. A bare `catch { return {} }` here
    // collapsed three very different failures into one indistinguishable
    // value: a DNS/transport failure, a 401 from a wrong api key, and "this
    // channel genuinely has no catalogRootId". Downstream only the last one
    // could be reported, so a mistyped endpoint or key surfaced as "channel N
    // exposes no catalogRootId".
    //
    // Throwing also keeps the failure out of the memo above: the assignment to
    // `channelDefaultsCache` never runs, so the next request retries instead
    // of serving the swallowed `{}` for a full TTL.
    throw new Error(
      `Channel ${channelId} lookup failed — check BOILERPLATE_GRAPHQL_ENDPOINT and BOILERPLATE_API_KEY.`,
      { cause }
    );
  }
}

/**
 * The channel's anonymous user, for the CLIENT to scope logged-out listings to.
 *
 * SSR already sends it (see `listingUserId`). Without handing it to the client,
 * the first client-side refetch asks a differently-scoped question and quietly
 * replaces the correct server-rendered list — assortment rules, negative order
 * lists in particular, are applied per user.
 */
export async function resolveAnonymousUserId(
  infra: ServerInfra
): Promise<number | undefined> {
  const { anonymousUserId } = await getChannelDefaults(infra.client, channelId);
  return anonymousUserId;
}

/**
 * User id a listing/search query runs as: the logged-in contact/customer, or —
 * for an anonymous render — the channel's `anonymousUserId` so guest pricing
 * follows the channel's configured account. Only anonymous renders hit the
 * channel query (and only its cache after the first).
 */
async function listingUserId(infra: ServerInfra): Promise<number | undefined> {
  if (infra.user) return resolveUserId(infra.user);
  const { anonymousUserId } = await getChannelDefaults(infra.client, channelId);
  return anonymousUserId;
}

/**
 * The catalog root category: the explicitly configured
 * `NUXT_PUBLIC_BASE_CATEGORY_ID` / `BASE_CATEGORY_ID`, or — when none is
 * provided — the channel's catalog root.
 *
 * The two are the only permitted sources; there is no literal fallback, because
 * guessing an id that doesn't exist on this tenant surfaces to shoppers as an
 * unexplained "Failed to load menu".
 *
 * @throws when neither source yields an id.
 */
export async function resolveBaseCategoryId(infra: ServerInfra): Promise<number> {
  if (baseCategoryId !== undefined) return baseCategoryId;
  const { catalogRootId } = await getChannelDefaults(infra.client, channelId);
  if (catalogRootId == null) {
    throw new Error(
      `No catalog root: channel ${channelId} exposes no catalogRootId and ` +
        'NUXT_PUBLIC_BASE_CATEGORY_ID / BASE_CATEGORY_ID are unset. Set one of the two.'
    );
  }
  return catalogRootId;
}

function resolveCompanyId(infra: ServerInfra): number | undefined {
  const user = infra.user;
  // Guard first: returning the cookie before this check leaked a companyId
  // onto customer and anonymous fetches.
  if (!user || !('contactId' in user)) return undefined;
  const contact = user as Contact;
  // `selected_company_id` is a non-httpOnly cookie, so it is user-writable and
  // can outlive the identity that set it. The API rejects a company the contact
  // is not a member of ("Unauthorized use of companyId") — an error the fetch
  // catch blocks do NOT swallow, so an unchecked value fails the page. Validate
  // against the contact's companies and fall back to their default.
  if (infra.selectedCompanyId !== undefined) {
    const match = contact.companies?.items?.find(
      (c) => c?.companyId === infra.selectedCompanyId
    );
    if (match?.companyId !== undefined) return match.companyId;
  }
  return contact.company?.companyId;
}

/**
 * Price scoping for a logged-in viewer: contact/customer plus the company they
 * are acting for. Without it the backend prices for the bearer token's default
 * company, so a contact who switched company saw their default company's prices
 * while the cart charged the selected one's (PWP-1015).
 *
 * Returns `undefined` for anonymous visitors on purpose — their request bodies
 * stay unchanged, and only anonymous fetches are cacheable.
 */
function buildPriceInput(infra: ServerInfra): PriceCalculateProductInput | undefined {
  const user = infra.user;
  if (!user) return undefined;
  const input: PriceCalculateProductInput = { taxZone: configuration.taxZone };
  if ('contactId' in user) input.contactId = (user as Contact).contactId;
  else if ('customerId' in user) input.customerId = (user as Customer).customerId;
  const companyId = resolveCompanyId(infra);
  if (companyId != null) input.companyId = companyId;
  return input;
}

function buildFilterInput(opts: ListingFetchOptions): Partial<CategoryProductSearchInput> {
  const slice: Partial<CategoryProductSearchInput> = {};
  if (opts.textFilters?.length) slice.textFilters = opts.textFilters;
  if (opts.priceFilterMin !== undefined || opts.priceFilterMax !== undefined) {
    const price: ProductPriceFilterInput = {
      from: opts.priceFilterMin ?? 0,
      to: opts.priceFilterMax ?? 999999,
    };
    slice.price = price;
  }
  return slice;
}

// ── fetchProduct ────────────────────────────────────────────────────────────

export async function fetchProduct(
  infra: ServerInfra,
  productId: number,
  language?: string
): Promise<FetchedProduct | null> {
  const lang = language ?? infra.language;
  const priceInput = buildPriceInput(infra);
  const userId = await listingUserId(infra);
  const companyId = resolveCompanyId(infra);
  const key = `sdk:product:${productId}:${stableStringify({ lang })}`;
  const tags = [TAG_CATALOG, tagFor('product'), tagFor('product', productId)];

  return cachedSdkFetch({
    key,
    tags,
    ttl: ANONYMOUS_CACHE_TTL_SECONDS,
    bypass: !infra.cacheable,
    fetcher: async () => {
      try {
        const result = await infra.services.product.getProduct({
          productId,
          language: lang,
          imageSearchFilters,
          imageVariantFilters: imageVariantFiltersLarge,
          ...(userId !== undefined && { userId }),
          ...(companyId !== undefined && { companyId }),
          // Logged-in only, so the anonymous body is unchanged.
          ...(priceInput
            ? {
                priceCalculateProductInput: priceInput,
                userBulkPriceProductInput: priceInput as UserBulkPriceProductInput,
              }
            : {}),
        });
        return result ? (toPlain(result) as FetchedProduct) : null;
      } catch (e) {
        if (e instanceof Error && /not found|null for non-nullable/i.test(e.message)) {
          return null;
        }
        throw e;
      }
    },
  });
}

// ── fetchCategory ───────────────────────────────────────────────────────────

export async function fetchCategory(
  infra: ServerInfra,
  categoryId: number,
  opts: ListingFetchOptions = {}
): Promise<FetchedCategory | null> {
  const lang = opts.language ?? infra.language;
  const sortField = opts.sortField ?? ProductSortField.CATEGORY_ORDER;
  const sortOrder = opts.sortOrder ?? SortOrder.DESC;
  const sortInputs: ProductSortInput[] = [{ field: sortField, order: sortOrder }];
  const userId = await listingUserId(infra);
  const companyId = resolveCompanyId(infra);
  const priceInput = buildPriceInput(infra);

  const categoryProductSearchInput: CategoryProductSearchInput = {
    language: lang,
    page: opts.page ?? 1,
    offset: opts.offset ?? 12,
    statuses: STOREFRONT_STATUSES,
    hidden: false,
    sortInputs,
    ...buildFilterInput(opts),
    ...(userId !== undefined && { userId }),
    ...(companyId !== undefined && { companyId }),
  };

  const key = `sdk:category:${categoryId}:${stableStringify({ lang, categoryProductSearchInput })}`;
  const tags = [TAG_CATALOG, tagFor('category'), tagFor('category', categoryId)];

  return cachedSdkFetch({
    key,
    tags,
    bypass: !infra.cacheable,
    fetcher: async () => {
      const run = (input: CategoryProductSearchInput) =>
        infra.services.category.getCategory({
          categoryId,
          language: lang,
          categoryProductSearchInput: input,
          filterAvailableAttributeInput: FILTER_AVAILABLE_ATTRIBUTE_INPUT,
          imageSearchFilters: imageSearchFiltersGrid,
          imageVariantFilters: imageVariantFiltersMedium,
          // Logged-in only, so the anonymous body is unchanged.
          ...(priceInput ? { priceCalculateProductInput: priceInput } : {}),
        });

      try {
        let result = await run(categoryProductSearchInput);
        // The URL carries filter names and values but no attribute types, and the
        // backend matches NOTHING when a type is wrong — no error, just an empty
        // grid. Correct them against the facets we just got back and redo the query,
        // but only when a type actually differed. See `retypeTextFilters` (PWP-992).
        const retyped = retypeTextFilters(
          categoryProductSearchInput.textFilters,
          (result?.products as ProductsResponse | undefined)?.filters
        );
        if (retyped) {
          result = await run({ ...categoryProductSearchInput, textFilters: retyped });
        }
        return result ? (toPlain(result) as FetchedCategory) : null;
      } catch (e) {
        if (e instanceof Error && /not found|null for non-nullable/i.test(e.message)) {
          return null;
        }
        throw e;
      }
    },
  });
}

// ── fetchSearch ─────────────────────────────────────────────────────────────

export async function fetchSearch(
  infra: ServerInfra,
  baseCategoryId: number,
  term: string,
  opts: ListingFetchOptions = {}
): Promise<ProductsResponse | null> {
  const lang = opts.language ?? infra.language;
  const sortField = opts.sortField ?? ProductSortField.RELEVANCE;
  const sortOrder = opts.sortOrder ?? SortOrder.DESC;
  const sortInputs: ProductSortInput[] = [{ field: sortField, order: sortOrder }];
  const userId = await listingUserId(infra);
  const companyId = resolveCompanyId(infra);
  const priceInput = buildPriceInput(infra);

  const categoryProductSearchInput: CategoryProductSearchInput = {
    language: lang,
    page: opts.page ?? 1,
    offset: opts.offset ?? 12,
    statuses: STOREFRONT_STATUSES,
    hidden: false,
    ...(term && { term, searchFields: SEARCH_FIELDS }),
    sortInputs,
    ...buildFilterInput(opts),
    ...(userId !== undefined && { userId }),
    ...(companyId !== undefined && { companyId }),
  };

  const key = `sdk:search:${baseCategoryId}:${stableStringify({ lang, term, categoryProductSearchInput })}`;
  const tags = [TAG_CATALOG, tagFor('search')];

  return cachedSdkFetch({
    key,
    tags,
    bypass: !infra.cacheable,
    fetcher: async () => {
      const run = (input: CategoryProductSearchInput) =>
        infra.services.category.getCategory({
          categoryId: baseCategoryId,
          language: lang,
          categoryProductSearchInput: input,
          filterAvailableAttributeInput: FILTER_AVAILABLE_ATTRIBUTE_INPUT,
          imageSearchFilters: imageSearchFiltersGrid,
          imageVariantFilters: imageVariantFiltersMedium,
          // Logged-in only, so the anonymous body is unchanged.
          ...(priceInput ? { priceCalculateProductInput: priceInput } : {}),
        });

      try {
        let result = await run(categoryProductSearchInput);
        // The URL carries filter names and values but no attribute types, and the
        // backend matches NOTHING when a type is wrong — no error, just an empty
        // grid. Correct them against the facets we just got back and redo the query,
        // but only when a type actually differed. See `retypeTextFilters` (PWP-992).
        const retyped = retypeTextFilters(
          categoryProductSearchInput.textFilters,
          (result as { products?: ProductsResponse } | null)?.products?.filters
        );
        if (retyped) {
          result = await run({ ...categoryProductSearchInput, textFilters: retyped });
        }
        const products = (result as { products?: ProductsResponse } | null)?.products;
        return products ? (toPlain(products) as ProductsResponse) : null;
      } catch (e) {
        if (e instanceof Error && /not found|null for non-nullable/i.test(e.message)) {
          return null;
        }
        throw e;
      }
    },
  });
}

// ── fetchCluster ────────────────────────────────────────────────────────────

export async function fetchCluster(
  infra: ServerInfra,
  clusterId: number,
  language?: string
): Promise<Cluster | null> {
  const lang = language ?? infra.language;
  const priceInput = buildPriceInput(infra);
  const userId = await listingUserId(infra);
  const companyId = resolveCompanyId(infra);
  const key = `sdk:cluster:${clusterId}:${stableStringify({ lang })}`;
  const tags = [TAG_CATALOG, tagFor('cluster'), tagFor('cluster', clusterId)];

  return cachedSdkFetch({
    key,
    tags,
    bypass: !infra.cacheable,
    fetcher: async () => {
      try {
        const clusterConfig = await infra.services.cluster.getClusterConfig(clusterId);
        const attributeNames: string[] = (clusterConfig?.config?.settings ?? []).map(
          (setting: ClusterConfigSetting) => setting.attributeName
        );

        const result = await infra.services.cluster.getCluster({
          clusterId,
          language: lang,
          imageSearchFilters: imageSearchFiltersGrid,
          imageVariantFilters: imageVariantFiltersLarge,
          ...(userId !== undefined && { userId }),
          ...(companyId !== undefined && { companyId }),
          ...(attributeNames.length > 0 && {
            attributeResultSearchInput: {
              attributeDescription: { names: attributeNames },
            },
          }),
          // Logged-in only, so the anonymous body is unchanged.
          ...(priceInput
            ? {
                priceCalculateProductInput: priceInput,
                userBulkPriceProductInput: priceInput as UserBulkPriceProductInput,
              }
            : {}),
        });
        return result ? (toPlain(result) as Cluster) : null;
      } catch (e) {
        if (e instanceof Error && /not found|null for non-nullable/i.test(e.message)) {
          return null;
        }
        throw e;
      }
    },
  });
}

// ── fetchMenu (recursive category tree) ─────────────────────────────────────

const MENU_DEPTH_DEFAULT = 3;

interface RawMenuCategory {
  categoryId: number;
  hidden?: boolean | string;
  names?: Array<{ value: string; language: string }>;
  slugs?: Array<{ value: string; language?: string }>;
  categories?: RawMenuCategory[];
}

function isMenuCategoryHidden(raw: RawMenuCategory): boolean {
  return raw.hidden === true || raw.hidden === 'Y';
}

function buildMenuCategoriesFragment(depth: number): string {
  if (depth === 0) return '';
  return `
    categories {
      categoryId
      hidden
      names { value language }
      slugs { value language }
      ${buildMenuCategoriesFragment(depth - 1)}
    }
  `;
}

function mapRawMenuCategory(raw: RawMenuCategory, language: string): MenuCategory {
  const nameEntry = raw.names?.find((n) => n.language === language) ?? raw.names?.[0];
  const slugEntry = raw.slugs?.find((s) => s.language === language) ?? raw.slugs?.[0];
  return {
    categoryId: raw.categoryId,
    name: nameEntry?.value ?? '',
    slug: slugEntry?.value ?? '',
    children: (raw.categories ?? [])
      .filter((child) => !isMenuCategoryHidden(child))
      .map((child) => mapRawMenuCategory(child, language)),
  };
}

export async function fetchMenu(
  infra: ServerInfra,
  rootCategoryId: number,
  language?: string,
  depth: number = MENU_DEPTH_DEFAULT
): Promise<MenuCategory[]> {
  const lang = language ?? infra.language;
  const key = `sdk:menu:${rootCategoryId}:${stableStringify({ lang, depth })}`;
  const tags = [TAG_CATALOG, tagFor('menu')];

  return cachedSdkFetch({
    key,
    tags,
    bypass: !infra.cacheable,
    fetcher: async () => {
      const query = `
        query Menu($categoryId: Float) {
          category(categoryId: $categoryId) {
            categoryId
            hidden
            names { value language }
            slugs { value language }
            ${buildMenuCategoriesFragment(depth)}
          }
        }
      `;
      try {
        const result = await infra.client.execute<{ category: RawMenuCategory | null }>({
          query,
          variables: { categoryId: rootCategoryId },
          operationName: 'Menu',
        });
        const root = result.data?.category ?? null;
        if (!root) return [];
        return (root.categories ?? [])
          .filter((cat) => !isMenuCategoryHidden(cat))
          .map((cat) => mapRawMenuCategory(cat, lang));
      } catch {
        return [];
      }
    },
  });
}

/** The facet-list shape `retypeTextFilters` reads — a structural subset of the
 *  SDK's `AttributeFilter`, so callers can pass the response array as-is. */
interface FacetTypeSource {
  type?: AttributeType | null;
  attributeDescription?: { name?: string | null; type?: AttributeType | null } | null;
}

/**
 * Correct the `type` on already-applied text filters against the facet list the
 * backend returned, and hand back the corrected array — or `undefined` when
 * every type already matched (the common case: nothing to redo).
 *
 * Attribute filters are typed (TEXT / ENUM / …) and the backend silently matches
 * NOTHING when the type is wrong — no error, just zero results. The server
 * builds its filters from the URL, which carries names and values but no types,
 * so ENUM-backed facets server-rendered an empty listing on any refreshed,
 * pasted or shared filtered URL. The client path never hit this: it resolves
 * each type from the facet list it already holds.
 *
 * Facets come back correctly typed even on a zero-result response, so one
 * corrected retry is enough and nothing extra is paid when the guess was right.
 *
 * Ported from propeller-next's lib/listingParams.ts — keep the three copies in
 * step (PWP-992).
 */
export function retypeTextFilters(
  applied: ProductTextFilterInput[] | undefined,
  facets: readonly FacetTypeSource[] | undefined,
): ProductTextFilterInput[] | undefined {
  if (!applied?.length || !facets?.length) return undefined;

  let changed = false;
  const corrected = applied.map((filter) => {
    const facet = facets.find((f) => f?.attributeDescription?.name === filter.name);
    const real = facet?.type ?? facet?.attributeDescription?.type;
    if (!real || real === filter.type) return filter;
    changed = true;
    return { ...filter, type: real };
  });

  return changed ? corrected : undefined;
}
