<template>
  <div class="py-12 bg-background">
    <div class="container-width max-w-5xl">
      <div v-if="error" class="text-center py-24 text-destructive">
        <p>{{ error }}</p>
        <button @click="router.back()" class="mt-4 text-primary hover:underline">Go back</button>
      </div>

      <template v-else-if="product">
        <ClientOnly>
          <ProductJsonLd :product="product as any" :context="jsonLdContext" />
        </ClientOnly>

        <div class="mb-6">
          <Breadcrumbs
            :categoryPath="((product as any).categoryPath as any) || []"
            :currentCategory="(product as any).category || undefined"
            :currentLabel="productName"
            :labels="breadcrumbsLabels"
          />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div class="bg-card rounded-[var(--radius-container)] shadow p-6">
            <ProductGallery :images="images" :labels="productGalleryLabels" />
          </div>

          <div class="flex flex-col gap-4">
            <ClientOnly>
              <ProductInfo :product="product as any" />
            </ClientOnly>

            <ProductPrice
              :product="product as any"
              :price="(product as any).price"
              :includeTax="priceStore.includeTax"
              :labels="productPriceLabels"
            />

            <div v-if="surchargeLines.length > 0" class="text-sm text-muted-foreground">
              <span class="font-medium">Additional surcharges:</span>
              <ul class="mt-1 space-y-0.5">
                <li v-for="(line, idx) in surchargeLines" :key="idx">{{ line }}</li>
              </ul>
            </div>

            <ProductBulkPrices
              v-if="(product as any).price"
              :product="product as any"
              :bulkPrices="(product as any).bulkPrices"
              :includeTax="priceStore.includeTax"
              :labels="productBulkPricesLabels"
            />

            <ProductShortDescription :product="product as any" />

            <ItemStock
              v-if="(product as any).inventory"
              :inventory="(product as any).inventory"
              :showAvailability="false"
              :labels="itemStockLabels"
            />

            <div class="flex items-center gap-2 mt-4">
              <ClientOnly>
                <AddToCart
                  :product="product as any"
                  :cartId="cartStore.cartId || undefined"
                  :createCart="true"
                  :showModal="true"
                  className="flex items-center w-full gap-2"
                  :enableIncrementDecrement="true"
                  :onCartCreated="(cart: Cart) => cartStore.setCart(cart)"
                  :afterAddToCart="(cart: Cart) => cartStore.setCart(cart)"
                  :onProceedToCheckout="() => router.push(localizeHref('/checkout', languageStore.language))"
                  :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
                  :labels="addToCartLabels"
                />
                <AddToFavorite
                  v-if="authStore.user"
                  :productId="(product as any).productId"
                  :labels="addToFavoriteLabels"
                />
              </ClientOnly>
            </div>
          </div>
        </div>

        <ClientOnly>
          <div class="mb-6">
            <ProductTabs
              :product="product as any"
              :productId="(product as any).productId"
              :labels="productTabsLabels"
            />
          </div>

          <ProductBundles
            :productId="(product as any).productId"
            :cartId="cartStore.cartId || undefined"
            taxZone="NL"
            :createCart="true"
            :showIndividualItems="true"
            :showModal="true"
            :onCartCreated="(cart: Cart) => cartStore.setCart(cart)"
            :afterBundleAddToCart="(cart: Cart) => cartStore.setCart(cart)"
            :onProceedToCheckout="() => router.push(localizeHref('/checkout', languageStore.language))"
            :labels="productBundlesLabels"
          />

          <ProductSlider
            v-for="type in CROSS_SELLS"
            :key="type"
            :cartId="cartStore.cartId || undefined"
            :crossUpsellTypes="[type]"
            :productId="(product as any).productId"
            :includeTax="priceStore.includeTax"
            :showAvailability="false"
            :showStock="true"
            :showModal="true"
            :createCart="true"
            :onCartCreated="(cart: Cart) => cartStore.setCart(cart)"
            :afterAddToCart="(cart: Cart) => cartStore.setCart(cart)"
            :onProceedToCheckout="() => router.push(localizeHref('/checkout', languageStore.language))"
            :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
            :onProductClick="(p: Product) => router.push(configuration.urls.getProductUrl(p, languageStore.language))"
            :onClusterClick="(c: Cluster) => router.push(configuration.urls.getClusterUrl(c, languageStore.language))"
            :labels="productSliderLabels"
            :productCardLabels="productCardLabels"
            :clusterCardLabels="clusterCardLabels"
            :stockLabels="itemStockLabels"
            :addToCartLabels="addToCartLabels"
            :priceLabels="productPriceLabels"
          />
        </ClientOnly>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type Cart, type Cluster, CrossupsellType, type Product } from '@propeller-commerce/propeller-sdk-v2';
import {
  AddToCart,
  AddToFavorite,
  Breadcrumbs,
  ItemStock,
  ProductBulkPrices,
  ProductBundles,
  ProductGallery,
  ProductInfo,
  ProductJsonLd,
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

const CROSS_SELLS = [
  CrossupsellType.ACCESSORIES,
  CrossupsellType.RELATED,
  CrossupsellType.ALTERNATIVES,
  CrossupsellType.OPTIONS,
  CrossupsellType.PARTS,
] as const;

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const languageStore = useLanguageStore();
const priceStore = usePriceStore();

const breadcrumbsLabels = useTranslations('Breadcrumbs');
const productGalleryLabels = useTranslations('ProductGallery');
const productPriceLabels = useTranslations('ProductPrice');
const productBulkPricesLabels = useTranslations('ProductBulkPrices');
const itemStockLabels = useTranslations('ItemStock');
const addToCartLabels = useTranslations('AddToCart');
const addToFavoriteLabels = useTranslations('AddToFavorite');
const productTabsLabels = useTranslations('ProductTabs');
const productBundlesLabels = useTranslations('ProductBundles');
const productSliderLabels = useTranslations('ProductSlider');
const productCardLabels = useTranslations('ProductCard');
const clusterCardLabels = useTranslations('ClusterCard');

const productId = computed(() => parseInt(route.params.productId as string));

const { data: product, error } = await useFetch('/api/catalog/product', {
  query: computed(() => ({
    id: productId.value,
    language: languageStore.language,
    companyId: companyStore.companyId ?? undefined,
  })),
  credentials: 'include',
  key: () => `product:${productId.value}:${languageStore.language}:company=${companyStore.companyId ?? ''}`,
  watch: [
    productId,
    () => languageStore.language,
    () => companyStore.companyId,
  ],
});

if (!product.value && !error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Product not found' });
}

const images = computed(
  () =>
    (product.value as any)?.media?.images?.items
      ?.map((img: any) => img.imageVariants?.[0]?.url)
      .filter((url: any): url is string => !!url) ?? []
);

const productName = computed(() =>
  product.value
    ? (getLanguageString((product.value as any).names, languageStore.language, '') as string)
    : ''
);

const surchargeLines = computed<string[]>(() => {
  const list = ((product.value as any)?.surcharges ?? []).filter((s: any) => s.enabled !== false);
  const fmtValue = (v: number) =>
    new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0));
  return list
    .map((s: any) => {
      const names = (s.name as { value?: string; language?: string }[]) ?? [];
      const name = names.find((n) => n.language === languageStore.language)?.value ?? names[0]?.value ?? '';
      const isPercentage = String(s.type ?? '').toLowerCase() === 'percentage';
      return isPercentage
        ? `1 x ${s.value}% (${name})`
        : `1 x ${configuration.currency} ${fmtValue(Number(s.value))} (${name})`;
    })
    .filter((line: string) => line.length > 0);
});

const seoTitle = computed(
  () =>
    resolveSeoTitle(
      (product.value as any)?.metadataTitles,
      (product.value as any)?.names,
      languageStore.language
    ) || productName.value || 'Product'
);
const seoDescription = computed(() => {
  const resolved = resolveSeoDescription(
    (product.value as any)?.metadataDescriptions,
    [(product.value as any)?.shortDescriptions, (product.value as any)?.descriptions],
    languageStore.language
  );
  return resolved ? stripHtml(resolved) : '';
});
const seoCanonical = computed(() =>
  resolveCanonicalUrl((product.value as any)?.metadataCanonicalUrls, languageStore.language)
);
const seoImage = computed(() => images.value[0] ?? '');

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
</script>
