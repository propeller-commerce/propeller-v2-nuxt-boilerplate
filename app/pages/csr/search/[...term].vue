<script setup lang="ts">
import { ProductGrid, GridFilters, GridToolbar } from '@propeller-commerce/propeller-v2-vue-ui';

definePageMeta({ ssr: false });

const route = useRoute();
const term = computed(() => {
  const raw = route.params.term;
  return Array.isArray(raw) ? raw.join(' ') : (raw as string);
});

useHead(() => ({ title: `CSR search: ${term.value}` }));
</script>

<template>
  <ClientOnly>
    <div class="container-width py-8">
      <h1 class="text-3xl font-bold mb-6">Search (CSR) — "{{ term }}"</h1>
      <div class="flex flex-col lg:flex-row gap-8">
        <aside class="w-full lg:w-64 flex-shrink-0">
          <GridFilters :collapsed="true" />
        </aside>
        <div class="flex-1 w-full min-w-0">
          <GridToolbar />
          <ProductGrid
            :term="term"
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
