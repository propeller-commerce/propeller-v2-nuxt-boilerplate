<template>
  <div class="text-center py-16">
    <h1 class="text-4xl font-bold text-foreground mb-4">{{ title }}</h1>
    <p class="text-muted-foreground text-lg max-w-xl mx-auto mb-6">{{ subtitle }}</p>
    <NuxtLink
      :to="localizeHref('/', languageStore.language)"
      class="inline-block bg-primary text-primary-foreground px-8 py-3 rounded-[var(--radius-container)] font-medium hover:bg-primary/90 transition"
    >
      {{ ctaLabel }}
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';

withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    ctaLabel?: string;
  }>(),
  {
    title: 'Welcome to Propeller',
    subtitle: 'Discover our full catalog of products — quality, selection, and fast delivery.',
    ctaLabel: 'Browse Products',
  }
);

const languageStore = useLanguageStore();
</script>
