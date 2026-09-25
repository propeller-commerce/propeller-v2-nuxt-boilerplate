<template>
  <div class="bg-background">
    <div class="container-width py-16">
      <div class="text-center mb-12">
        <h1 class="text-4xl font-bold text-foreground mb-4">
          {{ t.welcomeTitle }}
        </h1>
        <p class="text-muted-foreground text-lg max-w-xl mx-auto">
          {{ t.welcomeSubtitle }}
        </p>
        <NuxtLink
          :to="localizeHref('/search', languageStore.language)"
          class="inline-block mt-6 bg-primary text-primary-foreground px-8 py-3 rounded font-medium hover:bg-primary/90 transition"
        >
          {{ t.browseProducts }}
        </NuxtLink>
      </div>

      <ClientOnly v-if="featuredProductIds.length > 0">
        <ProductSlider
          :productIds="featuredProductIds"
          :taxZone="(configuration as any).taxZone"
          :includeTax="priceStore.includeTax"
          :cartId="cartStore.cartId || undefined"
          :createCart="true"
          :showModal="true"
          :showStock="true"
          :showAvailability="false"
          :onCartCreated="(cart: Cart) => cartStore.setCart(cart)"
          :afterAddToCart="(cart: Cart) => cartStore.setCart(cart)"
          :title="t.featuredProducts"
          :onProductClick="(product: Product) => router.push(configuration.urls.getProductUrl(product, languageStore.language))"
          :onClusterClick="(cluster: Cluster) => router.push(configuration.urls.getClusterUrl(cluster, languageStore.language))"
          :onProceedToCheckout="() => router.push(localizeHref('/checkout', languageStore.language))"
          :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
          :labels="productSliderLabels"
          :productCardLabels="productCardLabels"
          :clusterCardLabels="clusterCardLabels"
          :stockLabels="itemStockLabels"
          :addToCartLabels="addToCartLabels"
          :priceLabels="productPriceLabels"
        />

        <template #fallback>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
            <div v-for="i in 4" :key="i" class="aspect-square animate-pulse rounded-lg bg-muted" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ProductSlider } from '@propeller-commerce/propeller-v2-vue-ui';
import type { Cart, Cluster, Product } from '@propeller-commerce/propeller-sdk-v2';
import { useCartStore } from '~/stores/cart';
import { useLanguageStore } from '~/stores/language';
import { usePriceStore } from '~/stores/price';
import { configuration, localizeHref } from '~/utils/config';
import { useTranslations } from '~/composables/useTranslations';

const router = useRouter();
const cartStore = useCartStore();
const languageStore = useLanguageStore();
const priceStore = usePriceStore();
const runtimeConfig = useRuntimeConfig();

// Tenant-specific, so a fresh scaffold ships none and the block stays hidden.
const featuredProductIds = computed(() =>
  String(runtimeConfig.public.featuredProductIds || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0),
);

const t = useTranslations('Home');
const productSliderLabels = useTranslations('ProductSlider');
const productCardLabels = useTranslations('ProductCard');
const clusterCardLabels = useTranslations('ClusterCard');
const itemStockLabels = useTranslations('ItemStock');
const addToCartLabels = useTranslations('AddToCart');
const productPriceLabels = useTranslations('ProductPrice');

useHead({ title: () => t.value.welcomeTitle });
</script>
