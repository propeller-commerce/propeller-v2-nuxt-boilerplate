<template>
  <div class="min-h-screen flex flex-col bg-background">
    <AppHeader />
    <main class="flex-1">
      <div class="container-width py-16 text-center">
        <h1 class="text-4xl font-bold text-foreground mb-4">{{ title }}</h1>
        <p class="text-muted-foreground text-lg max-w-xl mx-auto mb-6">{{ subtitle }}</p>
        <button
          type="button"
          class="inline-block bg-primary text-primary-foreground px-8 py-3 rounded-[var(--radius-container)] font-medium hover:bg-primary/90 transition"
          @click="goHome"
        >
          {{ t.backToHome }}
        </button>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
/**
 * Nuxt error page. Without this file Nuxt renders its built-in one, which
 * serialises the Pinia payload and throws (`obj.hasOwnProperty is not a
 * function`) — turning every 404 into a 500.
 */
import { computed } from 'vue';
import type { NuxtError } from '#app';
import AppHeader from '~/components/layout/AppHeader.vue';
import AppFooter from '~/components/layout/AppFooter.vue';
import { useLanguageStore } from '~/stores/language';
import { useTranslations } from '~/composables/useTranslations';
import { localizeHref } from '~/utils/config';

const props = defineProps<{ error: NuxtError }>();

const t = useTranslations('ErrorPages');
const languageStore = useLanguageStore();
const isNotFound = computed(() => props.error?.statusCode === 404);

const title = computed(() =>
  isNotFound.value ? t.value.notFoundTitle : t.value.genericErrorTitle,
);
const subtitle = computed(() =>
  isNotFound.value ? t.value.notFoundMessage : t.value.genericErrorMessage,
);

// `clearError` and not a plain link: the error state has to be torn down or
// Nuxt keeps rendering this page over the destination.
function goHome() {
  clearError({ redirect: localizeHref('/', languageStore.language) });
}

useHead({ title: () => title.value });
</script>
