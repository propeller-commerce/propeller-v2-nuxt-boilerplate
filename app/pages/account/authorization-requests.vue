<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight">Authorization Requests</h1>
    </div>
    <ClientOnly>
      <PurchaseAuthorizationRequests
        v-if="authStore.user && isContact(authStore.user) && companyStore.companyId"
        :afterAcceptRequest="handleAfterAccept"
        :afterDeleteRequest="handleAfterReject"
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
import { track } from '~/lib/tracking/bus';

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

/**
 * "Delete" IS the rejection in this UI — a manager refusing the request. The
 * callback carries only the id, so value/item_count are deliberately absent
 * rather than guessed from a cart we no longer hold.
 */
function handleAfterReject(cartId: string) {
  track(
    'propeller.authorization_request_rejected',
    { cart_id: cartId ?? null },
    `authorization_request_rejected:${cartId ?? ''}`
  );
}

function handleAfterAccept(acceptedCart: Cart) {
  // Procurement approving a request: the step between "cart built" and "order
  // placed" that is invisible in the mutation stream today.
  track(
    'propeller.authorization_request_approved',
    {
      cart_id: acceptedCart?.cartId ?? null,
      value: acceptedCart?.total?.totalGross ?? null,
      item_count: acceptedCart?.items?.length ?? 0,
    },
    `authorization_request_approved:${acceptedCart?.cartId ?? ''}`
  );
  parkManagerCart(cartStore.cart);
  cartStore.setCart(acceptedCart);
  router.push(localizeHref('/cart', languageStore.language));
}

useHead({ title: 'Authorization requests' });
</script>
