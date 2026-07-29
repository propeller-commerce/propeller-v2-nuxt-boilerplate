<template>
  <div class="min-h-[70vh] flex items-center justify-center py-12 px-4">
    <div class="w-full max-w-md">
      <ClientOnly>
        <LoginForm
          :labels="loginFormLabels"
          :cart="cartStore.cart as Cart | null"
          :afterLogin="handleLoginSuccess"
          :onForgotPasswordClick="() => router.push(localizeHref('/forgot-password', languageStore.language))"
          :onRegisterClick="() => router.push(localizeHref('/register', languageStore.language))"
          :accountHeaderLoginForm="false"
          :displayGuestCheckoutLink="false"
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
import type { Cart, Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';
import { LoginForm } from '@propeller-commerce/propeller-v2-vue-ui';
import { useCartStore } from '~/stores/cart';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { useTranslations } from '~/composables/useTranslations';
import { useAfterLogin } from '~/composables/useAfterLogin';

const loginFormLabels = useTranslations('LoginForm');

const router = useRouter();
const route = useRoute();
const cartStore = useCartStore();
const languageStore = useLanguageStore();
// Shared post-login sequence, reused by the magic-login page. See composables/useAfterLogin.
const runAfterLogin = useAfterLogin();

async function handleLoginSuccess(
  user: Contact | Customer,
  accessToken?: string,
  refreshToken?: string,
  expiresAt?: string,
  anonymousCart?: Cart | null
) {
  const { effectiveLanguage } = await runAfterLogin(user, accessToken, refreshToken, expiresAt, anonymousCart);
  const redirect = (route.query.redirect as string) || localizeHref('/account', effectiveLanguage);
  router.push(redirect);
}

useHead({ title: 'Login' });
</script>
