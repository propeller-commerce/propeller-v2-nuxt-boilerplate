<template>
  <div class="py-12 bg-background">
    <div class="container-width">
      <ClientOnly>
        <ClusterJsonLd v-if="cluster" :cluster="cluster as any" :context="jsonLdContext" />
      </ClientOnly>

      <div class="mb-6">
        <Breadcrumbs
          :categoryPath="(selectedProduct as any)?.categoryPath || []"
          :currentCategory="(selectedProduct as any)?.category || undefined"
          :showCurrent="true"
          :labels="breadcrumbsLabels"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div class="bg-card rounded-[var(--radius-container)] shadow p-6">
          <ProductGallery :images="displayImages" :labels="productGalleryLabels" />
        </div>

        <div class="flex flex-col">
          <div class="mb-6">
            <ClientOnly>
              <ClusterInfo
                :cluster="cluster as any"
                :clusterId="clusterId"
                :onClusterLoaded="handleClusterLoaded"
                :imageSearchFilters="configuration.imageSearchFilters"
                :imageVariantFilters="configuration.imageVariantFiltersLarge"
              />
            </ClientOnly>

            <template v-if="cluster">
              <ProductPrice
                :price="selectedProduct?.price ?? (cluster as any).defaultProduct?.price"
                :options="(cluster as any).options"
                :selectedOptionProducts="Object.values(selectedOptionProducts)"
                :includeTax="priceStore.includeTax"
                :labels="productPriceLabels"
              />

              <ProductBulkPrices
                :product="selectedProduct || (cluster as any).defaultProduct"
                :includeTax="priceStore.includeTax"
                :labels="productBulkPricesLabels"
              />

              <div class="mt-6">
                <ProductShortDescription :product="selectedProduct || (cluster as any).defaultProduct" />
              </div>

              <div v-if="(selectedProduct as any)?.inventory" class="my-4">
                <ItemStock
                  :inventory="(selectedProduct as any).inventory"
                  :showAvailability="false"
                  :labels="itemStockLabels"
                />
              </div>

              <ClientOnly>
                <div v-if="(cluster as any).products?.length > 1 && (cluster as any).config" class="mt-6 mb-6 pb-6 border-b border-border">
                  <ClusterConfigurator
                    :clusterId="clusterId"
                    :products="(cluster as any).products"
                    :config="(cluster as any).config"
                    :defaultProduct="(cluster as any).defaultProduct"
                    :onConfigurationChange="(product: any) => { selectedProduct = product; }"
                    :labels="clusterConfiguratorLabels"
                  />
                </div>

                <div v-if="(cluster as any).options?.length > 0" class="mb-6">
                  <ClusterOptions
                    :clusterId="clusterId"
                    :options="(cluster as any).options"
                    :onOptionSelect="handleOptionSelect"
                    :onOptionClear="handleOptionClear"
                    :showErrors="showClusterErrors"
                    :labels="clusterOptionsLabels"
                  />
                </div>
              </ClientOnly>
            </template>

            <div class="flex items-center gap-2">
              <ClientOnly>
                <AddToCart
                  :product="selectedProduct"
                  :cluster="cluster as any"
                  :beforeAddToCart="validateClusterOptions"
                  :childItems="Object.values(selectedOptionProducts).map((p: any) => p.productId)"
                  :cartId="cartStore.cartId || undefined"
                  className="flex items-center w-full gap-2"
                  :createCart="true"
                  :showModal="true"
                  :onCartCreated="(cart: any) => cartStore.setCart(cart)"
                  :afterAddToCart="(cart: any) => cartStore.setCart(cart)"
                  :onProceedToCheckout="() => router.push(localizeHref('/checkout', languageStore.language))"
                  :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
                  :labels="addToCartLabels"
                />
                <AddToFavorite
                  v-if="authStore.user"
                  :clusterId="clusterId"
                  :labels="addToFavoriteLabels"
                />
              </ClientOnly>
            </div>
          </div>
        </div>
      </div>

      <ClientOnly>
        <ProductTabs
          v-if="displayProduct"
          :product="displayProduct"
          :productId="displayProduct.productId"
          class="pb-8"
          :labels="productTabsLabels"
        />

        <ProductSlider
          v-for="crossType in crossUpsellSliders"
          :key="crossType"
          :crossUpsellTypes="[crossType]"
          :clusterId="clusterId"
          :cartId="cartStore.cartId || undefined"
          :includeTax="priceStore.includeTax"
          :showAvailability="false"
          :showStock="true"
          :showModal="true"
          :createCart="true"
          :onCartCreated="(cart: any) => cartStore.setCart(cart)"
          :afterAddToCart="(cart: any) => cartStore.setCart(cart)"
          :onProceedToCheckout="() => router.push(localizeHref('/checkout', languageStore.language))"
          :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
          :onProductClick="(p: any) => router.push(configuration.urls.getProductUrl(p, languageStore.language))"
          :onClusterClick="(c: any) => router.push(configuration.urls.getClusterUrl(c, languageStore.language))"
          :labels="productSliderLabels"
          :productCardLabels="productCardLabels"
          :clusterCardLabels="clusterCardLabels"
          :stockLabels="itemStockLabels"
          :addToCartLabels="addToCartLabels"
          :priceLabels="productPriceLabels"
        />
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CrossupsellType } from '@propeller-commerce/propeller-sdk-v2';
import {
  AddToCart,
  AddToFavorite,
  Breadcrumbs,
  ClusterConfigurator,
  ClusterInfo,
  ClusterJsonLd,
  ClusterOptions,
  ItemStock,
  ProductBulkPrices,
  ProductGallery,
  ProductPrice,
  ProductShortDescription,
  ProductSlider,
  ProductTabs,
  getLanguageString,
} from 'propeller-v2-vue-ui';
import { stripHtml } from 'propeller-v2-vue-ui/shared';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { usePriceStore } from '~/stores/price';
import { configuration, localizeHref } from '~/utils/config';
import { resolveSeoTitle, resolveSeoDescription, resolveCanonicalUrl, buildJsonLdContext } from '~/utils/seo';
import { useTranslations } from '~/composables/useTranslations';

const breadcrumbsLabels = useTranslations('Breadcrumbs');
const productGalleryLabels = useTranslations('ProductGallery');
const productPriceLabels = useTranslations('ProductPrice');
const productBulkPricesLabels = useTranslations('ProductBulkPrices');
const itemStockLabels = useTranslations('ItemStock');
const clusterConfiguratorLabels = useTranslations('ClusterConfigurator');
const clusterOptionsLabels = useTranslations('ClusterOptions');
const addToCartLabels = useTranslations('AddToCart');
const addToFavoriteLabels = useTranslations('AddToFavorite');
const productTabsLabels = useTranslations('ProductTabs');
const productSliderLabels = useTranslations('ProductSlider');
const productCardLabels = useTranslations('ProductCard');
const clusterCardLabels = useTranslations('ClusterCard');

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const languageStore = useLanguageStore();
const priceStore = usePriceStore();

const clusterId = computed(() => parseInt(route.params.clusterId as string));

const { data: cluster, error } = await useFetch('/api/catalog/cluster', {
  query: computed(() => ({
    id: clusterId.value,
    language: languageStore.language,
    companyId: companyStore.companyId ?? undefined,
  })),
  credentials: 'include',
  key: () => `cluster:${clusterId.value}:${languageStore.language}:company=${companyStore.companyId ?? ''}`,
  watch: [
    clusterId,
    () => languageStore.language,
    () => companyStore.companyId,
  ],
});

if (!cluster.value && !error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Cluster not found' });
}

const selectedProduct = ref<any>((cluster.value as any)?.defaultProduct ?? null);
const selectedOptionProducts = ref<Record<number, any>>({});
const showClusterErrors = ref(false);

const crossUpsellSliders = [
  CrossupsellType.ACCESSORIES,
  CrossupsellType.ALTERNATIVES,
  CrossupsellType.RELATED,
  CrossupsellType.OPTIONS,
  CrossupsellType.PARTS,
];

const displayProduct = computed(() => selectedProduct.value || (cluster.value as any)?.defaultProduct || null);

const displayImages = computed(
  () =>
    displayProduct.value?.media?.images?.items
      ?.map((img: any) => img.imageVariants?.[0]?.url)
      .filter((url: any): url is string => !!url) ?? []
);

const seoTitle = computed(() => {
  const fromMetadata = resolveSeoTitle(
    (cluster.value as any)?.metadataTitles,
    (cluster.value as any)?.names,
    languageStore.language
  );
  if (fromMetadata) return fromMetadata;
  const productNames = displayProduct.value?.names;
  return productNames
    ? (getLanguageString(productNames, languageStore.language, '') as string) || 'Product'
    : 'Product';
});

const seoDescription = computed(() => {
  const resolved = resolveSeoDescription(
    (cluster.value as any)?.metadataDescriptions,
    [(cluster.value as any)?.shortDescriptions, (cluster.value as any)?.descriptions],
    languageStore.language
  );
  return resolved ? stripHtml(resolved) : '';
});

const seoCanonical = computed(() =>
  resolveCanonicalUrl((cluster.value as any)?.metadataCanonicalUrls, languageStore.language)
);

const seoImage = computed(() => displayImages.value[0] ?? '');

const jsonLdContext = computed(() => buildJsonLdContext({ language: languageStore.language, user: authStore.user }));

useHead({
  title: seoTitle,
  meta: [
    { name: 'description', content: seoDescription },
    { property: 'og:title', content: seoTitle },
    { property: 'og:description', content: seoDescription },
    { property: 'og:type', content: 'product' },
    { property: 'og:image', content: seoImage },
    { name: 'twitter:card', content: computed(() => (seoImage.value ? 'summary_large_image' : 'summary')) },
    { name: 'twitter:title', content: seoTitle },
    { name: 'twitter:description', content: seoDescription },
    { name: 'twitter:image', content: seoImage },
  ],
  link: computed(() => (seoCanonical.value ? [{ rel: 'canonical', href: seoCanonical.value }] : [])),
});

function handleClusterLoaded(loadedCluster: any) {
  // ClientOnly mounts ClusterInfo client-side; it may re-fetch via the SDK.
  // Update the seeded cluster + selectedProduct from the fresh payload.
  (cluster as any).value = loadedCluster;
  if (loadedCluster.defaultProduct) {
    selectedProduct.value = loadedCluster.defaultProduct;
  }
}

function handleOptionSelect(product: any) {
  const option = (cluster.value as any)?.options?.find((opt: any) =>
    opt.products?.some((p: any) => p.productId === product.productId)
  );
  if (option) {
    selectedOptionProducts.value = { ...selectedOptionProducts.value, [option.id]: product };
  }
}

function handleOptionClear(optionId: number) {
  if (!(optionId in selectedOptionProducts.value)) return;
  const next = { ...selectedOptionProducts.value };
  delete next[optionId];
  selectedOptionProducts.value = next;
}

function validateClusterOptions(): boolean {
  if (!(cluster.value as any)?.options) return true;
  const hasUnfilled = (cluster.value as any).options.some(
    (opt: any) => opt.hidden !== 'Y' && opt.isRequired === 'Y' && !(opt.id in selectedOptionProducts.value)
  );
  if (hasUnfilled) {
    showClusterErrors.value = true;
    return false;
  }
  return true;
}

watch(
  () => route.params.clusterId,
  () => {
    selectedProduct.value = null;
    selectedOptionProducts.value = {};
    showClusterErrors.value = false;
  }
);
</script>
