import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MenuCategory } from 'propeller-v2-vue-ui/shared';

/**
 * Menu tree store — seeded server-side by the default layout's
 * `useAsyncData('menu', ...)` call, then read by `<AppHeader>` to skip the
 * package `<Menu>` component's internal fetch. Survives across navigations.
 *
 * Mirrors propeller-vue/src/stores/menu.ts.
 */
export const useMenuStore = defineStore('menu', () => {
  const tree = ref<MenuCategory[] | null>(null);

  function setTree(next: MenuCategory[]): void {
    tree.value = next;
  }

  return { tree, setTree };
});
