<template>
  <div class="min-h-[70vh] flex items-center justify-center py-12 px-4">
    <div class="w-full max-w-md">
      <!-- Outside ClientOnly so the heading is in the server HTML. The
           component's own title would be a second heading, so it is
           suppressed with an empty `title`. -->
      <h1 class="text-2xl font-bold text-center mb-6">{{ forgotPasswordLabels.title }}</h1>

      <ClientOnly>
        <ForgotPassword
          :labels="forgotPasswordLabels"
          title=""
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

const pageTitles = useTranslations('PageTitles');
useHead({ title: () => pageTitles.value.forgotPassword });

const router = useRouter();
const languageStore = useLanguageStore();
const forgotPasswordLabels = useTranslations('ForgotPassword');

</script>
