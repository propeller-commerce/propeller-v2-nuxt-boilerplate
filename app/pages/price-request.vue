<template>
  <div class="py-8 bg-background">
    <div class="container-width max-w-5xl">
      <p
        v-if="sendError"
        role="alert"
        class="mb-4 rounded border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {{ sendError }}
      </p>
      <div class="bg-card rounded-[var(--radius-container)] shadow-sm p-6">
        <!--
          Client-only: the list lives in localStorage, which has no meaning on
          the server. Rendering it in SSR would emit an empty list the client
          immediately replaces.
        -->
        <ClientOnly>
          <PriceRequestList
            :items="priceRequest.items.value"
            :submitting="priceRequest.submitting.value"
            :labels="t"
            :onRemove="priceRequest.remove"
            :onQuantityChange="priceRequest.setQuantity"
            :onSubmit="handleSubmit"
          />
        </ClientOnly>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Price-request route — the quote basket for products whose price is not
 * published.
 *
 * Deliberately separate from the cart: a quoted product has no price to total
 * and cannot be paid for, so it must never reach checkout. Login-only via the
 * `auth` middleware, because a quote is addressed to someone.
 *
 * Mirrors propeller-vue's PriceRequestView and propeller-next's /price-request.
 */
import { ref } from 'vue';
import { PriceRequestList, usePriceRequest } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useLanguageStore } from '~/stores/language';
import { useTranslations } from '~/composables/useTranslations';

const pageTitles = useTranslations('PageTitles');
useHead({ title: () => pageTitles.value.priceRequest });

definePageMeta({ middleware: 'auth' });

const t = useTranslations('PriceRequest');
const authStore = useAuthStore();
const languageStore = useLanguageStore();

const priceRequest = usePriceRequest({
  onSubmit: async (items, comment) => {
    const user = authStore.user as {
      email?: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      phone?: string;
    } | null;
    const res = await fetch('/api/price-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        comment,
        language: languageStore.language,
        email: user?.email ?? '',
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
        company: user?.companyName ?? '',
        phone: user?.phone ?? '',
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'failed');
    }
  },
});

const sendError = ref('');

async function handleSubmit(comment: string): Promise<boolean> {
  sendError.value = '';
  const ok = await priceRequest.submit(comment);
  if (!ok) sendError.value = t.value.sendFailed || 'Could not send the request';
  return ok;
}
</script>
