<template>
  <div class="py-8 bg-background">
    <div class="container-width">
      <p v-if="tooDeep" class="py-24 text-center text-foreground-subtle">Not found.</p>
      <!-- Machines are CSR: render client-only so the self-fetching grid never
           runs during SSR (mirrors propeller-next's 'use client' machines page). -->
      <ClientOnly v-else>
        <MachineGrid
          :key="segments.join('/')"
          :segments="segments"
          :basePath="basePath"
          :source="source"
          :sourceIds="sourceIds"
          :machineLanguage="machineLanguage"
          :listing="listing"
          :onListingChange="onListingChange"
          :configuration="machineConfiguration"
          :cartId="cartStore.cartId || undefined"
          :onCartCreated="(cart: Cart) => cartStore.setCart(cart)"
          :afterAddToCart="(cart: Cart) => cartStore.setCart(cart)"
          :onProductClick="onProductClick"
          :paginationLabels="paginationLabels"
          :filtersLabels="filtersLabels"
          :toolbarLabels="toolbarLabels"
        />
        <template #fallback>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div v-for="i in 4" :key="i" class="aspect-square animate-pulse rounded-lg bg-muted" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MachineBrowser — the shared spare-parts browser rendered by both machines
 * pages (`machines/index.vue` for the root, `machines/[...slug].vue` for
 * drill-down). Reads the URL, resolves the MY_INSTALLATIONS company ids, and
 * maps listing changes back to the URL; all fetching/rendering lives in the
 * package's <MachineGrid>. Mirrors propeller-next's machines page + propeller-vue's
 * MachinesView. Auth is enforced by the pages' `middleware: 'auth'`.
 */
import { computed } from 'vue';
import type { Cart, Product } from '@propeller-commerce/propeller-sdk-v2';
import { MachineGrid, type MachineListingState } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { useCartStore } from '~/stores/cart';
import { useLanguageStore } from '~/stores/language';
import { configuration, localizeHref } from '~/utils/config';
import {
  MACHINE_MAX_DEPTH,
  MACHINE_SORT_FIELD_DEFAULT,
  MACHINE_SORT_ORDER_DEFAULT,
  resolveInstallationIds,
} from '~/utils/machines';
import { useListingParams, buildListingQuery } from '~/composables/useCatalogListing';
import { useTranslations } from '~/composables/useTranslations';

const route = useRoute();
const router = useRouter();
const runtimeConfig = useRuntimeConfig();
const authStore = useAuthStore();
const companyStore = useCompanyStore();
const cartStore = useCartStore();
const languageStore = useLanguageStore();

const paginationLabels = useTranslations('GridPagination');
const filtersLabels = useTranslations('GridFilters');
const toolbarLabels = useTranslations('GridToolbar');

const segments = computed<string[]>(() => {
  const raw = route.params.slug;
  return Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
});
// WP silently 404s past the last rewrite rule; be explicit.
const tooDeep = computed(() => segments.value.length > MACHINE_MAX_DEPTH);

// Machine source/language come from runtimeConfig.public (correct on the client).
// app/utils/config.ts's process.env reads are undefined in the browser bundle.
const source = computed(() => (runtimeConfig.public.machineSource as string) || undefined);
const machineLanguage = computed(() => (runtimeConfig.public.machineLanguage as string) || 'EN');

const sourceIds = computed(() =>
  resolveInstallationIds(authStore.user, companyStore.companyId ?? undefined),
);
const basePath = computed(() => localizeHref('/machines', languageStore.language));

const parsed = useListingParams(MACHINE_SORT_FIELD_DEFAULT);
const listing = computed<MachineListingState>(() => ({
  ...parsed.value,
  term: (route.query.term as string) ?? '',
}));

const machineConfiguration = computed(() => ({
  imageSearchFiltersGrid: configuration.imageSearchFiltersGrid,
  imageVariantFiltersMedium: configuration.imageVariantFiltersMedium,
}));

function onListingChange(next: MachineListingState): void {
  const query = buildListingQuery(
    { ...next, sortField: String(next.sortField), sortOrder: String(next.sortOrder) },
    { defaultSortField: MACHINE_SORT_FIELD_DEFAULT, defaultSortOrder: MACHINE_SORT_ORDER_DEFAULT },
  );
  const path = [basePath.value, ...segments.value].join('/');
  router.push({ path, query });
}

function onProductClick(product: Product): void {
  router.push(configuration.urls.getProductUrl(product, languageStore.language));
}
</script>
