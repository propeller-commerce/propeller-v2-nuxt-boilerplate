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

      <Breadcrumbs
        v-if="category"
        :categoryPath="(category as any).categoryPath || []"
        :currentCategory="category as any"
        :showCurrent="true"
        :labels="breadcrumbsLabels"
      />

      <GridTitle :title="categoryName" :labels="gridTitleLabels" />

      <CategoryDescription v-if="category" :category="category as any" />

      <div class="propeller-catalog-grid flex flex-col lg:flex-row gap-8 mt-4">
        <ClientOnly>
          <aside class="propeller-catalog-aside w-full lg:w-64 flex-shrink-0">
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
            <div class="sticky top-20 z-30 bg-background/95 backdrop-blur py-2 lg:static lg:bg-transparent lg:py-0 mb-2">
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

            <ProductGrid
              :products="controlledProducts"
              :categoryId="categoryId"
              :includeTax="priceStore.includeTax"
              :columns="viewMode === 'list' ? 1 : 3"
              :cartId="cartStore.cartId || undefined"
              :createCart="true"
              :showModal="true"
              :textFilters="activeTextFilters"
              :showPrice="true"
              :showStock="true"
              :showAvailability="false"
              :allowAllCategories="true"
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
              :onCategoryChange="handleCategoryChange"
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

            <div class="flex justify-center gap-2 mt-12">
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
  type Category,
  type Cluster,
  type Product,
  ProductSortField,
  type ProductsResponse,
  type ProductTextFilterInput,
  SortOrder,
} from '@propeller-commerce/propeller-sdk-v2';
import {
  Breadcrumbs,
  CategoryDescription,
  GridFilters,
  GridPagination,
  GridTitle,
  GridToolbar,
  ItemListJsonLd,
  ProductGrid,
} from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { usePriceStore } from '~/stores/price';
import { configuration, localizeHref } from '~/utils/config';
import {
  resolveSeoTitle,
  resolveSeoDescription,
  resolveSeoKeywords,
  resolveCanonicalUrl,
  buildJsonLdContext,
} from '~/utils/seo';
import { useTranslations } from '~/composables/useTranslations';
import { useListingParams } from '~/composables/useCatalogListing';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const languageStore = useLanguageStore();
const priceStore = usePriceStore();

const breadcrumbsLabels = useTranslations('Breadcrumbs');
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

const categoryId = computed(() => parseInt(route.params.id as string));
const slug = computed(() => route.params.slug as string);

const listing = useListingParams('CATEGORY_ORDER');

const { data: seededCategory } = await useFetch('/api/catalog/category', {
  query: computed(() => ({
    id: categoryId.value,
    language: languageStore.language,
    page: listing.value.page,
    offset: listing.value.offset,
    sortField: listing.value.sortField,
    sortOrder: listing.value.sortOrder,
    filters: Object.keys(listing.value.filters).length ? JSON.stringify(listing.value.filters) : undefined,
    minPrice: listing.value.minPrice,
    maxPrice: listing.value.maxPrice,
    // Company scopes the price calculation server-side, so a swap re-fetches.
    // Tax mode is a pure display switch — both gross and net come back in the
    // response and the package components recompute via PropellerProvider.
    companyId: companyStore.companyId ?? undefined,
  })),
  credentials: 'include',
  key: () => `category:${categoryId.value}:${languageStore.language}:${listing.value.page}:${listing.value.offset}:${listing.value.sortField}:${listing.value.sortOrder}:company=${companyStore.companyId ?? ''}`,
  watch: [
    categoryId,
    listing,
    () => languageStore.language,
    () => companyStore.companyId,
  ],
});

if (!seededCategory.value) {
  throw createError({ statusCode: 404, statusMessage: 'Category not found' });
}

const category = ref<Category | null>(seededCategory.value as Category | null);
const seededProducts = ((seededCategory.value as any)?.products as ProductsResponse | undefined) ?? null;
const productsResponse = ref<ProductsResponse | null>(seededProducts);
const gridFilters = ref<AttributeFilter[]>((seededProducts?.filters as AttributeFilter[] | undefined) ?? []);

const usingServerData = ref(!!seededProducts);
// Seeded items are derived from productsResponse so they stay in sync when
// useFetch re-runs (company switch, language switch, listing param change).
// A plain `const` snapshot would freeze at the first payload and the grid
// would never repaint after the user changed their selected company.
const seededItems = computed<(Product | Cluster)[]>(
  () => ((productsResponse.value?.items ?? []) as (Product | Cluster)[])
);

const jsonLdContext = computed(() =>
  buildJsonLdContext({ language: languageStore.language, user: authStore.user })
);
// JsonLd schema.org list reflects the current SSR seed (re-computes when the
// fetch re-fires due to e.g. company switch).
const jsonLdFirstPage = computed(() => seededItems.value as Product[]);
const controlledProducts = computed<(Product | Cluster)[] | undefined>(() =>
  usingServerData.value ? seededItems.value : undefined
);
function markUserInteracted(): void {
  if (usingServerData.value) usingServerData.value = false;
}

const priceBoundsMin = ref<number | undefined>();
const priceBoundsMax = ref<number | undefined>();
const itemsFound = ref((seededProducts?.itemsFound as number | undefined) ?? 0);
const filtersLoading = ref(false);

// Keep local refs in sync when useFetch re-runs (company switch, language
// switch, listing param change). Without this, the initial snapshot sticks
// and the grid never repaints after the user changes their selected company,
// even though the underlying fetch re-fires and seededCategory.value updates.
watch(seededCategory, (next) => {
  if (!next) return;
  category.value = next as Category | null;
  const nextProducts = ((next as any)?.products as ProductsResponse | undefined) ?? null;
  productsResponse.value = nextProducts;
  gridFilters.value = (nextProducts?.filters as AttributeFilter[] | undefined) ?? [];
  itemsFound.value = (nextProducts?.itemsFound as number | undefined) ?? 0;
  // Re-arm the SSR seed so the grid shows fresh items immediately instead
  // of waiting for ProductGrid's own client-side fetch.
  usingServerData.value = !!nextProducts;
});

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
  if (currentPage.value > 1) query.page = String(currentPage.value);
  for (const [key, values] of Object.entries(filters.value)) {
    if (values.length > 0) query[key] = JSON.stringify(values);
  }
  if (minPrice.value !== undefined) query.minPrice = String(minPrice.value);
  if (maxPrice.value !== undefined) query.maxPrice = String(maxPrice.value);
  if (offset.value !== 12) query.offset = String(offset.value);
  if (sortField.value !== ProductSortField.CATEGORY_ORDER) query.sortField = sortField.value;
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

// Computed (not a function) so the template binding survives the
// script-setup compiler's handling of bindings declared after the
// top-level `await useFetch(...)` above. Declaring this as
// `function getCategoryName()` breaks $setup exposure on hydration
// and the page renders "$setup.getCategoryName is not a function".
const categoryName = computed<string>(() => {
  if (!category.value) return slug.value;
  const nameArr = (category.value as any).name || (category.value as any).names || [];
  const match = nameArr.find((n: any) => n.language === languageStore.language);
  return match?.value || nameArr[0]?.value || slug.value;
});

const seoTitle = computed(
  () =>
    resolveSeoTitle(
      (category.value as any)?.metadataTitles,
      (category.value as any)?.name,
      languageStore.language
    ) || categoryName.value || 'Category'
);
const seoDescription = computed(
  () =>
    resolveSeoDescription(
      (category.value as any)?.metadataDescriptions,
      [(category.value as any)?.shortDescription, (category.value as any)?.description],
      languageStore.language
    ) || ''
);
const seoKeywords = computed(
  () => resolveSeoKeywords((category.value as any)?.metadataKeywords, languageStore.language) || ''
);
const seoCanonical = computed(() =>
  resolveCanonicalUrl((category.value as any)?.metadataCanonicalUrls, languageStore.language)
);

useHead({
  title: seoTitle,
  meta: [
    { name: 'description', content: seoDescription },
    { name: 'keywords', content: seoKeywords },
    { property: 'og:title', content: seoTitle },
    { property: 'og:description', content: seoDescription },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: seoTitle },
    { name: 'twitter:description', content: seoDescription },
  ],
  link: computed(() => (seoCanonical.value ? [{ rel: 'canonical', href: seoCanonical.value }] : [])),
});

function handleFiltersChange(f: AttributeFilter[]) { gridFilters.value = f; }
function handleItemsFoundChange(count: number) { itemsFound.value = count; }
function handleLoadingChange(loading: boolean) { filtersLoading.value = loading; }
function handleProductGridPageChange(p: number) { currentPage.value = p; }
function handleProductsResponse(r: ProductsResponse) { productsResponse.value = r; }
function handleCategoryChange(c: Category) { category.value = c; }
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

watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId === oldId) return;
    category.value = null;
    productsResponse.value = null;
    filters.value = listing.value.filters;
    gridFilters.value = [];
    priceBoundsMin.value = undefined;
    priceBoundsMax.value = undefined;
    minPrice.value = listing.value.minPrice;
    maxPrice.value = listing.value.maxPrice;
    currentPage.value = listing.value.page;
    clearSignal.value++;
    markUserInteracted();
  }
);
</script>
