<template>
  <div class="min-h-[70vh] flex items-center justify-center py-12 px-4">
    <div class="w-full max-w-md">
      <ClientOnly>
        <ForgotPassword
          :labels="forgotPasswordLabels"
          :onNavigateToLogin="() => router.push(localizeHref('/login', languageStore.language))"
        />

        <template #fallback>
          <div class="space-y-3">
            <div class="h-10 bg-muted rounded animate-pulse" />
            <div class="h-10 bg-primary/40 rounded animate-pulse" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ForgotPassword } from '@propeller-commerce/propeller-v2-vue-ui';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { useTranslations } from '~/composables/useTranslations';

const router = useRouter();
const languageStore = useLanguageStore();
const forgotPasswordLabels = useTranslations('ForgotPassword');

useHead({ title: 'Forgot password' });
</script>
