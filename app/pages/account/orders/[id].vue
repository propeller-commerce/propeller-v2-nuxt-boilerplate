<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button @click="router.back()" class="text-sm text-primary hover:underline">← Back</button>
        <h1 class="text-3xl font-bold tracking-tight">Order Details</h1>
      </div>
    </div>

    <div v-if="loading" class="p-8 text-center">
      <div class="h-8 bg-slate-100 rounded w-1/3 mx-auto mb-4 animate-pulse" />
      <div class="h-4 bg-slate-100 rounded w-1/2 mx-auto animate-pulse" />
    </div>

    <div v-else-if="error" class="p-8 text-center text-destructive">
      <p>{{ String(error) }}</p>
    </div>

    <ClientOnly v-else-if="order">
      <div class="space-y-8">
        <div class="border rounded-[var(--radius-container)] p-6 space-y-4">
          <OrderSummary
            :order="order as any"
            :countries="COUNTRIES"
            :showReference="true"
            :showNotes="true"
            :showDeliveryAddress="true"
            :showInvoiceAddress="true"
            :showOrderNumber="true"
            :showOrderDate="true"
            :showOrderStatus="true"
            :showOrderTotal="true"
            :showDeliveryInfo="true"
            :showRemarks="true"
            :labels="orderSummaryLabels"
          />
          <OrderActions
            :order="order as any"
            :cartId="cartStore.cartId || undefined"
            :onCartCreated="(cart: Cart) => cartStore.setCart(cart)"
            :afterReorder="(cart: Cart) => cartStore.setCart(cart)"
            :labels="orderActionsLabels"
          />
        </div>

        <OrderShipments :order="order as any" :labels="orderShipmentsLabels" />

        <div class="pt-10">
          <h2 class="text-2xl font-bold mb-6">Order Overview</h2>

          <div v-if="parentItems.length > 0" class="bg-card rounded-[var(--radius-container)] shadow overflow-hidden mb-8">
            <table class="w-full">
              <thead class="bg-surface-hover border-b">
                <tr>
                  <th class="px-6 py-4 text-left text-sm font-medium text-muted-foreground w-2/3">Product</th>
                  <th class="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Quantity</th>
                  <th class="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Price</th>
                </tr>
              </thead>
              <OrderItemCard
                v-for="item in parentItems"
                :key="item.id"
                :orderItem="item"
                :childItems="childMap.get(item.id) || []"
                :titleLinkable="true"
                :showImage="true"
                :showSku="true"
                :showQuantity="true"
                :showPrice="true"
                :labels="orderItemCardLabels"
              />
            </table>
          </div>

          <OrderBonusItems :order="order as any" :labels="orderBonusItemsLabels" />
        </div>

        <div class="flex flex-col md:flex-row justify-between gap-8 pt-6 border-t">
          <OrderActions
            :order="order as any"
            :cartId="cartStore.cartId || undefined"
            :onCartCreated="(cart: any) => cartStore.setCart(cart)"
            :afterReorder="(cart: any) => cartStore.setCart(cart)"
            :labels="orderActionsLabels"
          />
          <OrderTotals
            :order="order as any"
            :showSubtotal="true"
            :showDiscount="true"
            :showShippingCosts="true"
            :showVATs="true"
            :showTotalExclVat="true"
            :showTotalVat="true"
            :labels="orderTotalsLabels"
          />
        </div>
      </div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { Cart } from '@propeller-commerce/propeller-sdk-v2';
import {
  OrderActions,
  OrderBonusItems,
  OrderItemCard,
  OrderShipments,
  OrderSummary,
  OrderTotals,
  useOrders,
  type AnyUser,
} from 'propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { configuration } from '~/utils/config';
import { COUNTRIES } from '~/utils/countries';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const orderSummaryLabels = useTranslations('OrderSummary');
const orderActionsLabels = useTranslations('OrderActions');
const orderShipmentsLabels = useTranslations('OrderShipments');
const orderItemCardLabels = useTranslations('OrderItemCard');
const orderBonusItemsLabels = useTranslations('OrderBonusItems');
const orderTotalsLabels = useTranslations('OrderTotals');

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const languageStore = useLanguageStore();
const { $graphqlClient } = useNuxtApp();

const { fetchOrder, currentOrder: order, orderLoading: loading, error } = useOrders({
  graphqlClient: $graphqlClient as any,
  user: computed(() => authStore.user as AnyUser),
  companyId: computed(() => companyStore.companyId ?? undefined),
  language: computed(() => languageStore.language),
  configuration,
});

const parentItems = computed(() => {
  const allProducts = (order.value?.items || []).filter((i: any) => i.class === 'product' && i.isBonus === 'N');
  return allProducts.filter((i: any) => !i.parentOrderItemId);
});
const childMap = computed(() => {
  const allProducts = (order.value?.items || []).filter((i: any) => i.class === 'product' && i.isBonus === 'N');
  const map = new Map<number, any[]>();
  allProducts
    .filter((i: any) => i.parentOrderItemId)
    .forEach((i: any) => {
      const children = map.get(i.parentOrderItemId) || [];
      children.push(i);
      map.set(i.parentOrderItemId, children);
    });
  return map;
});

onMounted(async () => {
  await fetchOrder(parseInt(route.params.id as string));
});

useHead(() => ({ title: `Order #${route.params.id}` }));
</script>
