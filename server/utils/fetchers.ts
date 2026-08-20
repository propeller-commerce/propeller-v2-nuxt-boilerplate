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
  type ProductPriceFilterInput,
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
    // exposes no catalogRootId" (PWP-942 #9).
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
 * lists in particular, are applied per user (PWP-942 #22).
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
 * unexplained "Failed to load menu" (PWP-913).
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
  if (infra.selectedCompanyId !== undefined) return infra.selectedCompanyId;
  const user = infra.user;
  if (!user || !('contactId' in user)) return undefined;
  return (user as Contact).company?.companyId;
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
      try {
        const result = await infra.services.category.getCategory({
          categoryId,
          language: lang,
          categoryProductSearchInput,
          filterAvailableAttributeInput: FILTER_AVAILABLE_ATTRIBUTE_INPUT,
          imageSearchFilters: imageSearchFiltersGrid,
          imageVariantFilters: imageVariantFiltersMedium,
        });
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
      try {
        const result = await infra.services.category.getCategory({
          categoryId: baseCategoryId,
          language: lang,
          categoryProductSearchInput,
          filterAvailableAttributeInput: FILTER_AVAILABLE_ATTRIBUTE_INPUT,
          imageSearchFilters: imageSearchFiltersGrid,
          imageVariantFilters: imageVariantFiltersMedium,
        });
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
          ...(attributeNames.length > 0 && {
            attributeResultSearchInput: {
              attributeDescription: { names: attributeNames },
            },
          }),
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
