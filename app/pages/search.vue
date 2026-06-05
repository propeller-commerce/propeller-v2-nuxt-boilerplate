<template>
  <div class="py-8 bg-background">
    <div class="container-width">
      <ClientOnly>
        <ItemListJsonLd
          v-if="jsonLdFirstPage.length"
          :products="jsonLdFirstPage"
          :context="jsonLdContext"
        />
      </ClientOnly>

      <GridTitle
        :title="searchTerm ? `Search Products: '${searchTerm}'` : 'Search Products'"
        :labels="gridTitleLabels"
      />

      <div class="propeller-catalog-grid flex flex-col lg:flex-row gap-8 mt-4">
        <ClientOnly>
          <aside v-if="!hasNoResults" class="propeller-catalog-aside w-full lg:w-64 flex-shrink-0">
            <GridFilters
              :filters="gridFilters as AttributeFilter[]"
              :priceMin="priceBoundsMin"
              :priceMax="priceBoundsMax"
              :onFilterChange="handleFilterChange"
              :onPriceChange="handlePriceChange"
              :onClearFilters="handleClearFilters"
              :clearSignal="clearSignal"
              :activeTextFilters="filters"
              :activePriceMin="minPrice"
              :activePriceMax="maxPrice"
              :isLoading="filtersLoading"
              :isMobile="false"
              :collapsed="true"
              :labels="gridFiltersLabels"
            />
          </aside>

          <div class="flex-1 w-full min-w-0">
            <div v-if="!hasNoResults" class="sticky top-20 z-30 bg-background/95 backdrop-blur py-2 lg:static lg:bg-transparent lg:py-0 mb-2">
              <GridToolbar
                :viewMode="viewMode"
                :offset="[12, 24, 48]"
                :itemsFound="itemsFound"
                :defaultSort="[{ field: sortField, order: sortOrder }]"
                :defaultOffset="offset"
                :activeTextFilters="filters"
                :priceFilterMin="minPrice"
                :priceFilterMax="maxPrice"
                :onViewChange="(mode: string) => (viewMode = mode as 'grid' | 'list')"
                :onOffsetChange="handleOffsetChange"
                :onSortChange="handleSortChange"
                :onFilterRemove="handleFilterRemove"
                :onPriceFilterRemove="handlePriceFilterRemove"
                :onClearFilters="handleClearFilters"
                :labels="gridToolbarLabels"
              />
            </div>

            <template v-if="hasNoResults">
              <div class="flex flex-col items-center justify-center text-center py-16 px-4 bg-card rounded-[var(--radius-container)] border border-border">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="h-12 w-12 text-foreground-subtle mb-4">
                  <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="1.5" d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
                </svg>
                <h2 class="text-xl font-semibold text-foreground mb-2">
                  No products found for &quot;{{ searchTerm }}&quot;
                </h2>
                <p class="text-sm text-muted-foreground mb-6 max-w-md">
                  Try adjusting your search term, or browse our products from the homepage.
                </p>
                <button
                  type="button"
                  class="inline-flex items-center justify-center px-4 py-2 rounded-[var(--radius-control)] bg-primary text-primary-foreground hover:bg-primary/90 transition font-medium text-sm"
                  @click="() => router.push(localizeHref('/', languageStore.language))"
                >
                  Go to homepage
                </button>
              </div>
            </template>

            <ProductGrid
              v-show="!hasNoResults"
              :products="controlledProducts"
              :term="effectiveTerm"
              :categoryId="effectiveCategoryId"
              :includeTax="priceStore.includeTax"
              :columns="viewMode === 'list' ? 1 : 3"
              :cartId="cartStore.cartId || undefined"
              :createCart="true"
              :showModal="true"
              :textFilters="activeTextFilters"
              :showPrice="true"
              :showStock="true"
              :showAvailability="false"
              :allowIncrDecr="true"
              :allowAddToCart="true"
              :priceFilterMin="minPrice"
              :priceFilterMax="maxPrice"
              :pageSize="offset"
              :sortField="sortField"
              :sortOrder="sortOrder"
              :page="currentPage"
              :onFiltersChange="handleFiltersChange"
              :onPriceBoundsChange="handlePriceBoundsChange"
              :onItemsFoundChange="handleItemsFoundChange"
              :onLoadingChange="handleLoadingChange"
              :onPageChange="handleProductGridPageChange"
              :onProductsResponse="handleProductsResponse"
              :onCartCreated="(cart: Cart) => cartStore.setCart(cart)"
              :afterAddToCart="(cart: Cart) => cartStore.setCart(cart)"
              :onProductClick="(product: Product) => router.push(configuration.urls.getProductUrl(product, languageStore.language))"
              :onClusterClick="(cluster: Cluster) => router.push(configuration.urls.getClusterUrl(cluster, languageStore.language))"
              :onProceedToCheckout="() => router.push(localizeHref('/checkout', languageStore.language))"
              :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
              :labels="productGridLabels"
              :productCardLabels="productCardLabels"
              :clusterCardLabels="clusterCardLabels"
              :stockLabels="itemStockLabels"
              :addToCartLabels="addToCartLabels"
              :priceLabels="productPriceLabels"
            />

            <div v-if="!hasNoResults" class="flex justify-center gap-2 mt-12">
              <GridPagination
                v-if="productsResponse"
                :products="productsResponse as any"
                :onPageChange="handleGridPaginationPageChange"
                variant="full"
                :labels="gridPaginationLabels"
              />
            </div>
          </div>

          <template #fallback>
            <div class="flex-1 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div v-for="i in 6" :key="i" class="aspect-square animate-pulse rounded-lg bg-muted" />
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  type AttributeFilter,
  AttributeType,
  type Cart,
  type Cluster,
  type Product,
  ProductSortField,
  type ProductsResponse,
  type ProductTextFilterInput,
  SortOrder,
} from '@propeller-commerce/propeller-sdk-v2';
import {
  GridFilters,
  GridPagination,
  GridTitle,
  GridToolbar,
  ItemListJsonLd,
  ProductGrid,
} from 'propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { usePriceStore } from '~/stores/price';
import { configuration, localizeHref } from '~/utils/config';
import { buildJsonLdContext } from '~/utils/seo';
import { useTranslations } from '~/composables/useTranslations';
import { useListingParams } from '~/composables/useCatalogListing';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const languageStore = useLanguageStore();
const priceStore = usePriceStore();

const gridTitleLabels = useTranslations('GridTitle');
const gridFiltersLabels = useTranslations('GridFilters');
const gridToolbarLabels = useTranslations('GridToolbar');
const productGridLabels = useTranslations('ProductGrid');
const productCardLabels = useTranslations('ProductCard');
const clusterCardLabels = useTranslations('ClusterCard');
const itemStockLabels = useTranslations('ItemStock');
const addToCartLabels = useTranslations('AddToCart');
const productPriceLabels = useTranslations('ProductPrice');
const gridPaginationLabels = useTranslations('GridPagination');

const searchTerm = computed(() => {
  const term = route.query.q;
  return typeof term === 'string' ? term : '';
});

const isAllProducts = computed(() => !searchTerm.value);
const effectiveTerm = computed(() => (isAllProducts.value ? undefined : searchTerm.value));
const effectiveCategoryId = computed(() => (isAllProducts.value ? configuration.baseCategoryId : undefined));

const listing = useListingParams('RELEVANCE');

const { data: seededResponse } = await useFetch('/api/catalog/search', {
  query: computed(() => ({
    term: searchTerm.value,
    language: languageStore.language,
    page: listing.value.page,
    offset: listing.value.offset,
    sortField: listing.value.sortField,
    sortOrder: listing.value.sortOrder,
    filters: Object.keys(listing.value.filters).length ? JSON.stringify(listing.value.filters) : undefined,
    minPrice: listing.value.minPrice,
    maxPrice: listing.value.maxPrice,
    companyId: companyStore.companyId ?? undefined,
  })),
  credentials: 'include',
  key: () => `search:${searchTerm.value}:${languageStore.language}:${listing.value.page}:${listing.value.offset}:company=${companyStore.companyId ?? ''}`,
  watch: [
    searchTerm,
    listing,
    () => languageStore.language,
    () => companyStore.companyId,
  ],
});

const productsResponse = ref<ProductsResponse | null>((seededResponse.value as ProductsResponse | null) ?? null);
const gridFilters = ref<AttributeFilter[]>(((seededResponse.value as any)?.filters as AttributeFilter[] | undefined) ?? []);
const priceBoundsMin = ref<number | undefined>();
const priceBoundsMax = ref<number | undefined>();
const itemsFound = ref(((seededResponse.value as any)?.itemsFound as number | undefined) ?? 0);
const filtersLoading = ref(false);

const usingServerData = ref(!!seededResponse.value);
const seededItems = (((seededResponse.value as any)?.items ?? []) as (Product | Cluster)[]);

const jsonLdContext = computed(() => buildJsonLdContext({ language: languageStore.language, user: authStore.user }));
const jsonLdFirstPage = seededItems as Product[];
const controlledProducts = computed<(Product | Cluster)[] | undefined>(() => (usingServerData.value ? seededItems : undefined));
function markUserInteracted() {
  if (usingServerData.value) usingServerData.value = false;
}

const filters = ref<Record<string, string[]>>(listing.value.filters);
const minPrice = ref<number | undefined>(listing.value.minPrice);
const maxPrice = ref<number | undefined>(listing.value.maxPrice);
const clearSignal = ref(0);
const currentPage = ref(listing.value.page);
const offset = ref(listing.value.offset);
const sortField = ref<string>(listing.value.sortField);
const sortOrder = ref<string>(listing.value.sortOrder);
const viewMode = ref<'grid' | 'list'>('list');

let suppressQuerySync = false;
function syncStateToUrl() {
  markUserInteracted();
  const query: Record<string, string> = {};
  if (searchTerm.value) query.q = searchTerm.value;
  if (currentPage.value > 1) query.page = String(currentPage.value);
  for (const [key, values] of Object.entries(filters.value)) {
    if (values.length > 0) query[key] = JSON.stringify(values);
  }
  if (minPrice.value !== undefined) query.minPrice = String(minPrice.value);
  if (maxPrice.value !== undefined) query.maxPrice = String(maxPrice.value);
  if (offset.value !== 12) query.offset = String(offset.value);
  if (sortField.value !== ProductSortField.RELEVANCE) query.sortField = sortField.value;
  if (sortOrder.value !== SortOrder.DESC) query.sortOrder = sortOrder.value;
  if (JSON.stringify(route.query) === JSON.stringify(query)) return;
  suppressQuerySync = true;
  router.push({ path: route.path, query }).finally(() => {
    suppressQuerySync = false;
  });
}

watch(
  () => route.query,
  () => {
    if (suppressQuerySync) return;
    filters.value = listing.value.filters;
    minPrice.value = listing.value.minPrice;
    maxPrice.value = listing.value.maxPrice;
    currentPage.value = listing.value.page;
    offset.value = listing.value.offset;
    sortField.value = listing.value.sortField;
    sortOrder.value = listing.value.sortOrder;
  }
);

const hasNoResults = computed(
  () => !!searchTerm.value && !filtersLoading.value && itemsFound.value === 0 && productsResponse.value !== null
);

const activeTextFilters = computed<ProductTextFilterInput[]>(() =>
  Object.entries(filters.value)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => ({
      name,
      values,
      exclude: false,
      type: AttributeType.TEXT,
    }))
);

useHead({
  title: computed(() => (searchTerm.value ? `Search: "${searchTerm.value}"` : 'Search Products')),
  meta: [{ name: 'robots', content: 'noindex, follow' }],
});

function handleFiltersChange(f: AttributeFilter[]) { gridFilters.value = f; }
function handleItemsFoundChange(c: number) { itemsFound.value = c; }
function handleLoadingChange(l: boolean) { filtersLoading.value = l; }
function handleProductGridPageChange(p: number) { currentPage.value = p; }
function handleProductsResponse(r: ProductsResponse) { productsResponse.value = r; }
function handlePriceBoundsChange(min: number, max: number) {
  if (priceBoundsMin.value === undefined) priceBoundsMin.value = min;
  if (priceBoundsMax.value === undefined) priceBoundsMax.value = max;
}
function handleFilterChange(filter: AttributeFilter, value: string | number) {
  const name = filter.attributeDescription?.name || '';
  const current = filters.value[name] || [];
  const valueStr = String(value);
  const next = current.includes(valueStr) ? current.filter((v) => v !== valueStr) : [...current, valueStr];
  if (next.length === 0) {
    const updated = { ...filters.value };
    delete updated[name];
    filters.value = updated;
  } else {
    filters.value = { ...filters.value, [name]: next };
  }
  currentPage.value = 1;
  syncStateToUrl();
}
function handleFilterRemove(filterName: string, value: string) {
  const current = filters.value[filterName] || [];
  const next = current.filter((v) => v !== value);
  if (next.length === 0) {
    const updated = { ...filters.value };
    delete updated[filterName];
    filters.value = updated;
  } else {
    filters.value = { ...filters.value, [filterName]: next };
  }
  currentPage.value = 1;
  syncStateToUrl();
}
function handlePriceFilterRemove() {
  minPrice.value = undefined;
  maxPrice.value = undefined;
  currentPage.value = 1;
  syncStateToUrl();
}
function handlePriceChange(min: number, max: number) {
  minPrice.value = min;
  maxPrice.value = max;
  currentPage.value = 1;
  syncStateToUrl();
}
function handleClearFilters() {
  filters.value = {};
  minPrice.value = undefined;
  maxPrice.value = undefined;
  clearSignal.value++;
  currentPage.value = 1;
  syncStateToUrl();
}
function handleOffsetChange(val: number) {
  offset.value = val;
  currentPage.value = 1;
  syncStateToUrl();
}
function handleSortChange(field: string, order?: string) {
  sortField.value = field;
  if (order) sortOrder.value = order;
  currentPage.value = 1;
  syncStateToUrl();
}
function handleGridPaginationPageChange(page: number) {
  currentPage.value = page;
  syncStateToUrl();
}

watch(searchTerm, (newTerm, oldTerm) => {
  if (newTerm === oldTerm) return;
  filters.value = listing.value.filters;
  gridFilters.value = [];
  priceBoundsMin.value = undefined;
  priceBoundsMax.value = undefined;
  minPrice.value = listing.value.minPrice;
  maxPrice.value = listing.value.maxPrice;
  currentPage.value = listing.value.page;
  clearSignal.value++;
  markUserInteracted();
});
</script>
