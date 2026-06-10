<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight">Authorization Settings</h1>
    </div>
    <ClientOnly>
      <PurchaseAuthorizationConfigurator
        v-if="authStore.user && isContact(authStore.user) && companyStore.companyId"
        :labels="purchaseAuthorizationConfiguratorLabels"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';
import { PurchaseAuthorizationConfigurator } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const authStore = useAuthStore();
const companyStore = useCompanyStore();
const purchaseAuthorizationConfiguratorLabels = useTranslations('PurchaseAuthorizationConfigurator');

function isContact(u: Contact | Customer | null): u is Contact {
  return u !== null && 'contactId' in u;
}

useHead({ title: 'Authorization settings' });
</script>
