<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <button type="button" @click="router.back()" class="text-primary hover:underline text-sm">← Back to Favorites</button>
      <h1 class="text-3xl font-bold tracking-tight">{{ listName || 'Loading…' }}</h1>
    </div>
    <ClientOnly>
      <FavoriteListDetails
        v-if="authStore.user"
        :labels="favoriteListDetailsLabels"
        :favoriteListId="String(route.params.id)"
        :onListLoaded="(list: any) => { listName = list?.name || '' }"
        :onItemDelete="handleItemDelete"
        :onItemsDelete="handleItemsDelete"
        :cartId="cartStore.cartId || undefined"
        :createCart="true"
        :onCartCreated="(cart: any) => cartStore.setCart(cart)"
        :afterAddToCart="(cart: any) => cartStore.setCart(cart)"
        :itemsPerPage="12"
        :showPagination="true"
        :showStockComponent="true"
        :showAvailability="false"
        :showStock="true"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { FavoriteListDetails, useFavorites, type AnyUser } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const favoriteListDetailsLabels = useTranslations('FavoriteListDetails');
const { $graphqlClient } = useNuxtApp();

const listName = ref('');

const { removeFromList } = useFavorites({
  graphqlClient: $graphqlClient as any,
  user: computed(() => authStore.user as AnyUser),
});

async function handleItemDelete(itemId: string, itemType?: string) {
  const listId = String(route.params.id);
  const numericId = Number(itemId);
  if (itemType === 'cluster') {
    await removeFromList(listId, undefined, numericId);
  } else {
    await removeFromList(listId, numericId, undefined);
  }
}

async function handleItemsDelete(items: { id: string; type: 'product' | 'cluster' }[]) {
  if (items.length === 0) return;
  const listId = String(route.params.id);
  const productIds = items.filter((i) => i.type === 'product').map((i) => Number(i.id));
  const clusterIds = items.filter((i) => i.type === 'cluster').map((i) => Number(i.id));
  await removeFromList(
    listId,
    productIds.length ? productIds : undefined,
    clusterIds.length ? clusterIds : undefined
  );
}

useHead(() => ({ title: listName.value || 'Favorites' }));
</script>
