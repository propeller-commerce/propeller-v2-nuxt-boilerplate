<template>
  <div class="py-8 bg-surface-hover/20 min-h-[70vh]">
    <div class="container-width max-w-7xl">
      <h1 class="text-3xl font-bold mb-8">Shopping Cart</h1>

      <div v-if="!cartItems.length" class="text-center py-12">
        <p class="text-xl text-muted-foreground mb-4">Your cart is empty</p>
        <NuxtLink
          :to="localizeHref('/', languageStore.language)"
          class="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-[var(--radius-container)] hover:bg-primary/90 transition"
        >
          Continue Shopping
        </NuxtLink>
      </div>

      <ClientOnly v-else>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-4">
            <CartItem
              v-for="item in cartItems"
              :key="(item as any).itemId"
              :cartItem="item"
              :cartId="cartStore.cartId as string"
              :showCrossupsells="true"
              :crossupsellTypes="[CrossupsellType.ACCESSORIES]"
              :crossupsellLimit="2"
              :afterCartUpdate="(cart: any) => cartStore.setCart(cart)"
              :labels="cartItemLabels"
            />
            <CartBonusItems :cart="cartStore.cart as Cart" :labels="cartBonusItemsLabels" />
          </div>

          <div class="h-fit space-y-4">
            <CartSummary
              v-if="cartStore.cart"
              :cart="cartStore.cart as Cart"
              :onCheckoutButtonClick="() => router.push(localizeHref('/checkout', languageStore.language))"
              :afterRequestAuthorization="afterRequestAuthorization"
              :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
              :labels="cartSummaryLabels"
            />
            <ActionCode
              v-if="cartStore.cart"
              :cart="cartStore.cart as Cart"
              :afterActionCodeApply="(cart: any) => cartStore.setCart(cart)"
              :afterActionCodeRemove="(cart: any) => cartStore.setCart(cart)"
              :labels="actionCodeLabels"
            />
          </div>
        </div>

        <template #fallback>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-4">
              <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded bg-muted" />
            </div>
            <div class="h-64 animate-pulse rounded bg-muted" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type Cart, CrossupsellType } from '@propeller-commerce/propeller-sdk-v2';
import { ActionCode, CartBonusItems, CartItem, CartSummary } from 'propeller-v2-vue-ui';
import { useCartStore } from '~/stores/cart';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { restoreManagerCart } from '~/utils/cartHelpers';
import { useTranslations } from '~/composables/useTranslations';

const cartItemLabels = useTranslations('CartItem');
const cartBonusItemsLabels = useTranslations('CartBonusItems');
const cartSummaryLabels = useTranslations('CartSummary');
const actionCodeLabels = useTranslations('ActionCode');

const router = useRouter();
const cartStore = useCartStore();
const languageStore = useLanguageStore();

const cartItems = computed(() => cartStore.cart?.items || []);

function afterRequestAuthorization(cart: Cart) {
  cartStore.setCart(restoreManagerCart());
  router.push(localizeHref(`/authorization-request-sent/${cart.cartId}`, languageStore.language));
}

useHead({ title: 'Shopping Cart' });
</script>
