<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight">Authorization Requests</h1>
    </div>
    <ClientOnly>
      <PurchaseAuthorizationRequests
        v-if="authStore.user && isContact(authStore.user) && companyStore.companyId"
        :afterAcceptRequest="handleAfterAccept"
        :labels="purchaseAuthorizationRequestsLabels"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { Cart, Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';
import { PurchaseAuthorizationRequests } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { parkManagerCart } from '~/utils/cartHelpers';
import { useTranslations } from '~/composables/useTranslations';

definePageMeta({ layout: 'account', middleware: 'auth' });

const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const languageStore = useLanguageStore();
const purchaseAuthorizationRequestsLabels = useTranslations('PurchaseAuthorizationRequests');

function isContact(u: Contact | Customer | null): u is Contact {
  return u !== null && 'contactId' in u;
}

function handleAfterAccept(acceptedCart: Cart) {
  parkManagerCart(cartStore.cart);
  cartStore.setCart(acceptedCart);
  router.push(localizeHref('/cart', languageStore.language));
}

useHead({ title: 'Authorization requests' });
</script>
