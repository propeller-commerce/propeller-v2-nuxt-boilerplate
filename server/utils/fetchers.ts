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
} from '@propeller-commerce/propeller-sdk-v2';
import { toPlain, type MenuCategory } from '@propeller-commerce/propeller-v2-vue-ui/shared';
import {
  imageSearchFilters,
  imageSearchFiltersGrid,
  imageVariantFiltersMedium,
  imageVariantFiltersLarge,
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

function resolveUserId(user: Contact | Customer | null): number | undefined {
  if (!user) return undefined;
  if ('contactId' in user) return (user as Contact).contactId;
  if ('customerId' in user) return (user as Customer).customerId;
  return undefined;
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
  const userId = resolveUserId(infra.user);
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
  const userId = resolveUserId(infra.user);
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
          (setting: ClusterConfigSetting) => setting.name
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
  name?: Array<{ value: string; language: string }>;
  slug?: Array<{ value: string; language?: string }>;
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
      name(language: $language) { value language }
      slug(language: $language) { value }
      ${buildMenuCategoriesFragment(depth - 1)}
    }
  `;
}

function mapRawMenuCategory(raw: RawMenuCategory, language: string): MenuCategory {
  const nameEntry = raw.name?.find((n) => n.language === language) ?? raw.name?.[0];
  const slugEntry = raw.slug?.[0];
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
        query Menu($categoryId: Float, $language: String) {
          category(categoryId: $categoryId) {
            categoryId
            hidden
            name(language: $language) { value language }
            slug(language: $language) { value }
            ${buildMenuCategoriesFragment(depth)}
          }
        }
      `;
      try {
        const result = await infra.client.execute<{ category: RawMenuCategory | null }>({
          query,
          variables: { categoryId: rootCategoryId, language: lang },
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
