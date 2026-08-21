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
              :afterCartUpdate="handleCartUpdate"
              :labels="cartItemLabels"
            />
            <CartBonusItems :cart="cartStore.cart as Cart" :labels="cartBonusItemsLabels" />
          </div>

          <div class="h-fit space-y-4">
            <!-- PunchOut: hand the cart back to the buyer's procurement system.
                 Shown only in a punchout session (readable flag cookie set by
                 /api/punchout/enter). Native form POST — the server route builds
                 the OCI/cXML payload and returns a self-submitting form. -->
            <form
              v-if="punchoutActive && cartStore.cart?.cartId"
              method="POST"
              action="/api/punchout/transfer"
              class="rounded-lg border bg-card p-4"
            >
              <p class="mb-3 text-sm text-muted-foreground">
                You are shopping from your procurement system. Send this cart back
                as a requisition.
              </p>
              <input type="hidden" name="cartId" :value="cartStore.cart.cartId" />
              <button
                type="submit"
                class="w-full rounded-lg bg-primary px-6 py-3 text-primary-foreground transition hover:bg-primary/90"
              >
                Transfer cart to procurement
              </button>
            </form>
            <CartSummary
              v-if="!punchoutActive && cartStore.cart"
              :cart="cartStore.cart as Cart"
              :onCheckoutButtonClick="() => router.push(localizeHref('/checkout', languageStore.language))"
              :afterRequestAuthorization="afterRequestAuthorization"
              :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
              :labels="cartSummaryLabels"
            />
            <ActionCode
              v-if="!punchoutActive && cartStore.cart"
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
import { computed, onMounted, ref, watch } from 'vue';
import { type Cart, CrossupsellType } from '@propeller-commerce/propeller-sdk-v2';
import { ActionCode, CartBonusItems, CartItem, CartSummary } from '@propeller-commerce/propeller-v2-vue-ui';
import { useCartStore } from '~/stores/cart';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { restoreManagerCart } from '~/utils/cartHelpers';
import { useTranslations } from '~/composables/useTranslations';
import { track } from '~/lib/tracking/bus';
// `cartItems` is already taken in this file by the template's own computed —
// alias rather than rename the template binding.
import { cartItems as cartGa4Items, cartValue, trackCartDiff } from '~/lib/tracking/events';

const cartItemLabels = useTranslations('CartItem');
const cartBonusItemsLabels = useTranslations('CartBonusItems');
const cartSummaryLabels = useTranslations('CartSummary');
const actionCodeLabels = useTranslations('ActionCode');

const router = useRouter();
const cartStore = useCartStore();
const languageStore = useLanguageStore();

const cartItems = computed(() => cartStore.cart?.items || []);

// PunchOut session flag — read after mount (the flag cookie is client-readable).
const punchoutActive = ref(false);
onMounted(() => {
  punchoutActive.value = /(?:^|;\s*)punchout_active=/.test(document.cookie);
});

function afterRequestAuthorization(cart: Cart) {
  track(
    'propeller.purchase_authorization_requested',
    {
      cart_id: cart?.cartId ?? null,
      value: cartValue(cart),
      item_count: cart?.items?.length ?? 0,
    },
    `purchase_authorization_requested:${cart?.cartId ?? ''}`
  );
  cartStore.setCart(restoreManagerCart());
  router.push(localizeHref(`/authorization-request-sent/${cart.cartId}`, languageStore.language));
}

// ── Cart tracking ──────────────────────────────────────────────────
//
// A plain `let`, deliberately NOT a ref and NOT `cartStore.cart`: the package
// may hand back the same cart object mutated in place, and an identity match
// would make the diff come out empty — losing every add and remove silently.
let previousCart: Cart | null = null;

/**
 * Shallow-clones each line so `quantity` — the one field the diff reads and the
 * one field mutated in place — is captured by value at snapshot time.
 */
const snapshot = (cart: Cart | null): Cart | null =>
  cart ? ({ ...cart, items: (cart.items ?? []).map((line) => ({ ...line })) } as Cart) : null;

/**
 * `<CartItem>` exposes ONE callback for every mutation — add, remove and
 * quantity edit alike — so provenance has to come from comparing snapshots.
 *
 * Scope is deliberately cart-page-only, matching propeller-next: the PDP,
 * search and category pages emit their own `add_to_cart` with real provenance,
 * so a global cart subscriber would double-count every one of them.
 */
function handleCartUpdate(cart: Cart) {
  trackCartDiff(previousCart, cart, languageStore.language);
  previousCart = snapshot(cart);
  cartStore.setCart(cart);
}

watch(
  () => [cartStore.cart?.cartId, cartStore.cart?.items?.length] as const,
  () => {
    const cart = cartStore.cart as Cart | null;
    track('page_viewed', { page_type: 'cart' }, 'page_viewed:cart');
    const count = cart?.items?.length ?? 0;
    track(
      'view_cart',
      // `cartValue` reads `totalGross`, which is the EX-VAT total in this SDK.
      // `totalNet` is tax-INCLUSIVE — sending it would inflate GA4 revenue by
      // the VAT rate against every other event in the funnel.
      { item_count: count, value: cartValue(cart), items: cartGa4Items(cart, languageStore.language) },
      `view_cart:${cart?.cartId ?? 'empty'}:${count}`
    );
    // Re-baseline here, not only on mount: `hydrate-stores.client.ts` restores
    // the cart from localStorage AFTER this page's setup, so a snapshot taken
    // at mount would be empty and the user's first edit would diff against
    // nothing — emitting a spurious `add_to_cart` for every line already there.
    previousCart = snapshot(cart);
  },
  { immediate: true }
);

useHead({ title: 'Shopping Cart' });
</script>
