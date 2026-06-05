import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Cart } from '@propeller-commerce/propeller-sdk-v2';
import { isBrowser, safeStorage } from '~/utils/ssr';

function loadCartFromStorage(): Cart | null {
  try {
    const stored = safeStorage.getItem('cart');
    if (!stored) return null;
    return JSON.parse(stored) as Cart;
  } catch {
    return null;
  }
}

export const useCartStore = defineStore('cart', () => {
  const cart = ref<Cart | null>(loadCartFromStorage());
  const isOpen = ref(false);

  const cartId = computed(() => cart.value?.cartId ?? null);

  const itemCount = computed(() => {
    if (!cart.value) return 0;
    const items = (cart.value as Cart & { items?: Array<{ quantity?: number }>; mainItems?: { items?: Array<{ quantity?: number }> } }).items ?? (cart.value as Cart & { mainItems?: { items?: Array<{ quantity?: number }> } }).mainItems?.items ?? [];
    return items.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 0), 0);
  });

  const totalPrice = computed(() => {
    return (cart.value as Cart & { total?: { totalNet?: number } } | null)?.total?.totalNet ?? 0;
  });

  function setCart(c: Cart | null) {
    cart.value = c;
    if (c) safeStorage.setItem('cart', JSON.stringify(c));
    else safeStorage.removeItem('cart');
  }

  /**
   * Client-only re-hydration after SSR state transfer. SSR can't see
   * localStorage so the server-rendered store value is null; the client
   * entry overrides via Pinia state and clobbers the setup initializer.
   * Call from a `.client.ts` plugin after Pinia hydrates.
   */
  function hydrateFromStorage() {
    if (!isBrowser) return;
    const stored = loadCartFromStorage();
    if (stored) cart.value = stored;
  }

  function saveCart(c: Cart) {
    setCart(c);
  }

  function clearCart() {
    cart.value = null;
    safeStorage.removeItem('cart');
  }

  function openCart() {
    isOpen.value = true;
  }
  function closeCart() {
    isOpen.value = false;
  }
  function toggleCart() {
    isOpen.value = !isOpen.value;
  }

  if (isBrowser) {
    window.addEventListener('userLoggedOut', () => clearCart());
    window.addEventListener('storage', (e) => {
      if (e.key !== 'cart') return;
      cart.value = e.newValue ? loadCartFromStorage() : null;
    });
  }

  return {
    cart,
    cartId,
    isOpen,
    itemCount,
    totalPrice,
    setCart,
    saveCart,
    clearCart,
    hydrateFromStorage,
    openCart,
    closeCart,
    toggleCart,
  };
});
