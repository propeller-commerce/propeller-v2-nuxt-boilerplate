<template>
  <div class="min-h-[70vh] flex items-center justify-center py-12 px-4">
    <div class="w-full max-w-5xl">
      <ClientOnly>
        <RegisterForm
          :labels="registerFormLabels"
          :countries="COUNTRIES_MAP"
          :cart="cartStore.cart as Cart | null"
          :afterRegistration="handleAfterRegistration"
          :onLoginClick="() => router.push(localizeHref('/login', languageStore.language))"
        />

        <template #fallback>
          <div class="space-y-3">
            <div class="h-10 bg-muted rounded animate-pulse" />
            <div class="h-10 bg-muted rounded animate-pulse" />
            <div class="h-10 bg-primary/40 rounded animate-pulse" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CartService } from '@propeller-commerce/propeller-sdk-v2';
import type { Cart, Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';
import { RegisterForm, mergeAnonymousCart, useCart, type AnyUser } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { configuration, localizeHref } from '~/utils/config';
import { COUNTRIES_MAP } from '~/utils/countries';
import { useTranslations } from '~/composables/useTranslations';

const registerFormLabels = useTranslations('RegisterForm');

const router = useRouter();
const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const languageStore = useLanguageStore();
const { $graphqlClient } = useNuxtApp();

const { fetchActiveCart, resolveCart } = useCart({
  graphqlClient: $graphqlClient as any,
  user: computed(() => authStore.user as AnyUser),
  companyId: computed(() => companyStore.selectedCompany?.companyId ?? undefined),
  language: computed(() => languageStore.language),
  configuration,
});

async function handleAfterRegistration(
  user: Contact | Customer,
  accessToken?: string,
  refreshToken?: string,
  expiresAt?: string,
  anonymousCart?: Cart | null
) {
  if (!accessToken) {
    router.push(localizeHref('/login', languageStore.language));
    return;
  }

  authStore.setUser(user);
  authStore.setToken(accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  if (expiresAt) localStorage.setItem('expiresAt', expiresAt);

  window.dispatchEvent(new CustomEvent('userLoggedIn'));

  const contactCompany = (user as Contact).company;
  if (contactCompany?.companyId) {
    companyStore.setSelectedCompany(contactCompany);
  }

  await $fetch('/api/auth/session', {
    method: 'POST',
    body: { accessToken, refreshToken },
  }).catch(() => {});

  const userLang = (user as any).primaryLanguage;
  if (userLang && userLang !== languageStore.language) {
    languageStore.setLanguage(userLang);
  }

  let targetCart = await fetchActiveCart();

  if (anonymousCart?.items?.length) {
    if (!targetCart) {
      targetCart = await resolveCart();
    }
    const merged = await mergeAnonymousCart({
      graphqlClient: $graphqlClient as any,
      targetCartId: targetCart.cartId,
      anonymousCart,
      language: languageStore.language,
      imageSearchFilters: configuration.imageSearchFiltersGrid,
      imageVariantFilters: configuration.imageVariantFiltersSmall,
    });
    if (merged) targetCart = merged;

    if (anonymousCart.cartId && anonymousCart.cartId !== targetCart.cartId) {
      try {
        await new CartService($graphqlClient as any).deleteCart({ id: anonymousCart.cartId });
      } catch (e) {
        console.error('[auth] Failed to delete anonymous cart', e);
      }
    }
  }

  cartStore.setCart(targetCart ?? null);

  router.push(localizeHref('/account', userLang || languageStore.language));
}

useHead({ title: 'Register' });
</script>
