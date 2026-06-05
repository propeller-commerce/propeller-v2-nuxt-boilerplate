<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button @click="router.back()" class="text-sm text-primary hover:underline">← Back</button>
        <h1 class="text-3xl font-bold tracking-tight">Quote Details</h1>
      </div>
    </div>

    <div v-if="loading" class="p-8 text-center">
      <div class="h-8 bg-slate-100 rounded w-1/3 mx-auto mb-4 animate-pulse" />
      <div class="h-4 bg-slate-100 rounded w-1/2 mx-auto animate-pulse" />
    </div>

    <div v-else-if="error" class="p-8 text-center text-destructive">
      <p>{{ String(error) }}</p>
    </div>

    <ClientOnly v-else-if="quote">
      <div class="space-y-8">
        <div class="border rounded-[var(--radius-container)] p-6 space-y-4">
          <OrderSummary
            :order="quote as any"
            :countries="COUNTRIES"
            :labels="{ ...orderSummaryLabels, orderNumber: 'Quote Number', orderDate: 'Quote Date' }"
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
          />
          <div class="flex flex-row items-end gap-3 flex-shrink-0 mt-4">
            <QuoteActions
              :quote="quote as any"
              :afterAccept="handleAfterAccept"
              :labels="quoteActionsLabels"
              :showTermsAndConditions="true"
              :onTermsAndConditionsClick="() => window.open(localizeHref('/terms-conditions', languageStore.language), '_blank')"
            />
            <button
              type="button"
              class="text-sm text-primary hover:underline px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="downloading"
              @click="handleDownloadPDF"
            >
              {{ downloading ? 'Downloading…' : 'Download Quote (PDF)' }}
            </button>
          </div>
        </div>

        <div class="pt-10">
          <h2 class="text-2xl font-bold mb-6 mt-6">Quote Overview</h2>

          <div v-if="parentItems.length > 0" class="bg-card rounded-[var(--radius-container)] shadow overflow-hidden mb-8">
            <table class="w-full">
              <thead class="bg-surface-hover border-b">
                <tr>
                  <th class="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Products</th>
                  <th class="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Quantity</th>
                  <th class="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Discount</th>
                  <th class="px-6 py-4 text-right text-sm font-medium text-muted-foreground">Price</th>
                </tr>
              </thead>
              <OrderItemCard
                v-for="item in parentItems"
                :key="item.id"
                :orderItem="item"
                :childItems="childMap.get(item.id) || []"
                :labels="orderItemCardLabels"
                :titleLinkable="true"
                :showImage="true"
                :showSku="true"
                :showQuantity="true"
                :showDiscount="true"
                :showPrice="true"
              />
            </table>
          </div>

          <OrderBonusItems :order="quote as any" :labels="orderBonusItemsLabels" />
        </div>

        <div class="flex flex-col md:flex-row justify-end gap-8 pt-6 border-t">
          <OrderTotals :order="quote as any" :labels="orderTotalsLabels" />
        </div>
      </div>

      <template v-if="toastVisible">
        <div
          :class="`fixed top-4 right-4 z-50 flex items-start gap-3 w-80 rounded-[var(--radius-container)] shadow-lg p-4 ${
            toastType === 'success' ? 'bg-success border border-success text-success-foreground' : 'bg-destructive border border-destructive text-destructive-foreground'
          }`"
        >
          <p class="flex-1 text-sm font-medium">{{ toastMessage }}</p>
          <button type="button" @click="toastVisible = false" class="text-sm">×</button>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  OrderBonusItems,
  OrderItemCard,
  OrderSummary,
  OrderTotals,
  QuoteActions,
  useOrders,
  type AnyUser,
} from 'propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useLanguageStore } from '~/stores/language';
import { configuration, localizeHref } from '~/utils/config';
import { COUNTRIES } from '~/utils/countries';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const languageStore = useLanguageStore();
const { $graphqlClient } = useNuxtApp();

const orderSummaryLabels = useTranslations('OrderSummary');
const quoteActionsLabels = useTranslations('QuoteActions');
const orderItemCardLabels = useTranslations('OrderItemCard');
const orderBonusItemsLabels = useTranslations('OrderBonusItems');
const orderTotalsLabels = useTranslations('OrderTotals');

const quoteId = route.params.id as string;

const {
  fetchOrder,
  currentOrder: quote,
  orderLoading: loading,
  error,
  downloadQuotePdf,
} = useOrders({
  graphqlClient: $graphqlClient as any,
  user: computed(() => authStore.user as AnyUser),
  language: computed(() => languageStore.language),
  configuration,
});

const parentItems = computed(() => {
  const allProducts = (quote.value?.items || []).filter((i: any) => i.class === 'product' && i.isBonus === 'N');
  return allProducts.filter((i: any) => !i.parentOrderItemId);
});

const childMap = computed(() => {
  const allProducts = (quote.value?.items || []).filter((i: any) => i.class === 'product' && i.isBonus === 'N');
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

function handleAfterAccept(acceptedQuote: any) {
  router.push(localizeHref(`/checkout/thank-you/${acceptedQuote.id}`, languageStore.language));
}

const downloading = ref(false);
const toastVisible = ref(false);
const toastMessage = ref('');
const toastType = ref<'success' | 'error'>('success');

function showDownloadToast(message: string, type: 'success' | 'error') {
  toastMessage.value = message;
  toastType.value = type;
  toastVisible.value = true;
  setTimeout(() => { toastVisible.value = false; }, 4000);
}

async function handleDownloadPDF() {
  if (downloading.value) return;
  downloading.value = true;
  try {
    const result = await downloadQuotePdf(Number(quoteId));
    if (result?.success) showDownloadToast('PDF downloaded successfully', 'success');
    else showDownloadToast(result?.error || 'Failed to download PDF', 'error');
  } catch (e) {
    console.error('Error downloading quote PDF:', e);
    showDownloadToast('Failed to download PDF', 'error');
  } finally {
    downloading.value = false;
  }
}

onMounted(async () => {
  await fetchOrder(parseInt(quoteId));
});

useHead(() => ({ title: `Quote #${quoteId}` }));
</script>
