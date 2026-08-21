<script setup lang="ts">
import { computed } from 'vue';
import { ProductGrid, GridFilters, GridToolbar } from '@propeller-commerce/propeller-v2-vue-ui';

// CSR comparison shadow — no SSR data fetch, ProductGrid runs its own
// client-side query via the package's useProductSearch.
definePageMeta({ ssr: false });

const route = useRoute();
const categoryId = computed(() => Number.parseInt(route.params.id as string, 10));

useHead(() => ({ title: `CSR category #${categoryId.value}` }));
</script>

<template>
  <ClientOnly>
    <div class="container-width py-8">
      <h1 class="text-3xl font-bold mb-6">Category (CSR) — #{{ categoryId }}</h1>
      <div class="flex flex-col lg:flex-row gap-8">
        <aside class="w-full lg:w-64 flex-shrink-0">
          <GridFilters :collapsed="true" />
        </aside>
        <div class="flex-1 w-full min-w-0">
          <GridToolbar />
          <ProductGrid
            :category-id="categoryId"
            :columns="3"
            :show-price="true"
            :show-stock="true"
            :allow-add-to-cart="true"
          />
        </div>
      </div>
    </div>
  </ClientOnly>
</template>
