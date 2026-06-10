<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
    </div>

    <ClientOnly>
      <UserDetails
        v-if="authStore.user"
        :labels="userDetailsLabels"
        :activeCompany="companyStore.selectedCompany as any"
        :showCompanyInfo="true"
        :listAllContactCompanies="false"
        :showDefaultInvoiceAddress="true"
        :showDefaultDeliveryAddress="true"
        :countries="COUNTRIES"
        :onUserUpdated="(user: any) => authStore.setUser(user)"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { UserDetails } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { COUNTRIES } from '~/utils/countries';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const authStore = useAuthStore();
const companyStore = useCompanyStore();
const userDetailsLabels = useTranslations('UserDetails');

useHead({ title: 'My account' });
</script>
