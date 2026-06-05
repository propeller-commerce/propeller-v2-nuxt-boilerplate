<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight">Quote Requests</h1>
    </div>
    <div class="bg-card shadow-sm">
      <ClientOnly>
        <OrderList
          v-if="authStore.isAuthenticated"
          :showCompanyOrders="false"
          :onOrderClick="(id: number) => router.push(localizeHref(`/account/quote-requests/${id}`, languageStore.language))"
          :orderStatus="['REQUEST']"
          :labels="labels"
          :rowsClickable="true"
          :columnConfig="{ id: '#', date: 'Date', status: 'Status', total: 'Total' }"
          :columns="['id', 'date', 'status', 'total']"
          :channelIds="[channelId]"
        />
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { OrderList } from 'propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const router = useRouter();
const authStore = useAuthStore();
const languageStore = useLanguageStore();
const runtimeConfig = useRuntimeConfig();
const channelId = Number(runtimeConfig.public.channelId ?? 1);

const labels = useTranslations('OrderList');

useHead({ title: 'Quote requests' });
</script>
