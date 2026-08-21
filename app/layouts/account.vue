<script setup lang="ts">
import AppHeader from '~/components/layout/AppHeader.vue';
import AppFooter from '~/components/layout/AppFooter.vue';
import AccountSidebar from '~/components/layout/AccountSidebar.vue';
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
  <div class="min-h-screen flex flex-col bg-muted/20">
    <AppHeader :menu-tree="menuTree ?? []" />
    <main class="flex-1 py-8">
      <div class="container-width max-w-7xl">
        <div class="flex flex-col lg:flex-row gap-8">
          <AccountSidebar />
          <div class="flex-1 min-w-0">
            <slot />
          </div>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>
