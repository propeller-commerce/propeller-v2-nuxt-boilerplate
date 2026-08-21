<script setup lang="ts">
import AppHeader from '~/components/layout/AppHeader.vue';
import AppFooter from '~/components/layout/AppFooter.vue';
import { useMenuStore } from '~/stores/menu';
import { useLanguageStore } from '~/stores/language';

const language = useLanguageStore();
const menuStore = useMenuStore();

const { data: menuTree } = await useFetch('/api/catalog/menu', {
  query: computed(() => ({ language: language.language })),
  key: 'menu',
  default: () => [],
});

watch(
  menuTree,
  (v) => {
    if (Array.isArray(v)) menuStore.setTree(v);
  },
  { immediate: true }
);
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <AppHeader :menu-tree="menuTree ?? []" />
    <main class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
