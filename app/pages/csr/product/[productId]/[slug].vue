<script setup lang="ts">
import { ProductInfo } from '@propeller-commerce/propeller-v2-vue-ui';

definePageMeta({ ssr: false });

const route = useRoute();
const productId = computed(() => Number.parseInt(route.params.productId as string, 10));

useHead(() => ({ title: `CSR product #${productId.value}` }));
</script>

<template>
  <ClientOnly>
    <div class="container-width py-8">
      <h1 class="text-3xl font-bold mb-6">Product (CSR) — #{{ productId }}</h1>
      <ProductInfo :product-id="productId" />
    </div>
  </ClientOnly>
</template>
