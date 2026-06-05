<template>
  <div class="min-h-[70vh] py-12 bg-surface-hover">
    <div class="container-width max-w-4xl">
      <div class="text-center mb-12">
        <div class="w-20 h-20 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg class="w-10 h-10 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-4xl font-bold text-foreground mb-4">Authorization Request Sent!</h1>
        <p class="text-lg text-muted-foreground">
          Your request has been submitted. An authorization manager will review it shortly.
        </p>
        <p v-if="cartId" class="text-sm text-foreground-subtle mt-2">Reference: {{ cartId }}</p>
      </div>

      <ClientOnly>
        <div v-if="cartItems.length > 0" class="space-y-8">
          <div class="bg-card rounded-[var(--radius-container)] shadow-sm border border-border overflow-hidden">
            <div class="px-6 py-4 border-b border-border-subtle">
              <h2 class="text-xl font-bold text-foreground">Cart Summary</h2>
            </div>
            <table class="w-full">
              <thead class="bg-surface-hover border-b border-border-subtle">
                <tr>
                  <th class="px-6 py-3 text-left text-sm font-medium text-muted-foreground w-2/3">Product</th>
                  <th class="px-6 py-3 text-center text-sm font-medium text-muted-foreground">Qty</th>
                  <th class="px-6 py-3 text-right text-sm font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                <tr v-for="item in cartItems" :key="item.itemId" class="hover:bg-surface-hover">
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      <img
                        v-if="getItemImageUrl(item)"
                        :src="getItemImageUrl(item)"
                        :alt="getItemName(item)"
                        class="w-12 h-12 object-contain rounded border border-border-subtle flex-shrink-0"
                      />
                      <div v-else class="w-12 h-12 bg-surface-hover rounded border border-border-subtle flex-shrink-0" />
                      <div>
                        <p class="text-sm font-medium text-foreground">{{ getItemName(item) }}</p>
                        <p v-if="item.product?.sku" class="text-xs text-foreground-subtle mt-0.5">SKU: {{ item.product.sku }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 text-center text-sm text-muted-foreground">{{ item.quantity }}</td>
                  <td class="px-6 py-4 text-right text-sm font-medium text-foreground">
                    {{ formatPrice(item.totalSumNet ?? 0) }}
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="px-6 py-4 bg-surface-hover border-t border-border-subtle space-y-2">
              <div class="flex justify-between text-sm text-muted-foreground">
                <span>Total excl. VAT:</span>
                <span>{{ formatPrice(totalExclVat) }}</span>
              </div>
              <div v-if="totalVat > 0" class="flex justify-between text-sm text-muted-foreground">
                <span>VAT:</span>
                <span>{{ formatPrice(totalVat) }}</span>
              </div>
              <div class="flex justify-between text-base font-bold text-foreground pt-2 border-t border-border">
                <span>Total:</span>
                <span>{{ formatPrice(total) }}</span>
              </div>
            </div>
          </div>
        </div>
      </ClientOnly>

      <div class="flex justify-center pt-8">
        <NuxtLink
          :to="localizeHref('/', languageStore.language)"
          class="px-8 py-3 bg-primary text-primary-foreground rounded-[var(--radius-container)] font-semibold hover:bg-primary/80 transition text-center"
        >
          Continue Shopping
        </NuxtLink>
      </div>
      <div class="text-center text-muted-foreground pt-6 text-sm">
        <p>You will be notified once your authorization request has been reviewed.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCartStore } from '~/stores/cart';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';

const route = useRoute();
const cartStore = useCartStore();
const languageStore = useLanguageStore();

const cartId = computed(() => route.params.cartId);

const cartItems = computed(
  () => (cartStore.cart as any)?.items || cartStore.cart?.mainItems?.items || []
);
const total = computed(() => (cartStore.cart as any)?.total?.totalNet ?? 0);
const totalExclVat = computed(() => (cartStore.cart as any)?.total?.totalGross ?? 0);
const totalVat = computed(() => total.value - totalExclVat.value);

function formatPrice(price: number) {
  return `€${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function getItemName(item: any) {
  return item.product?.names?.[0]?.value || 'Product';
}
function getItemImageUrl(item: any) {
  return item.product?.media?.images?.items?.[0]?.imageVariants?.[0]?.url || '';
}

useHead({ title: 'Authorization Request Sent' });
</script>
