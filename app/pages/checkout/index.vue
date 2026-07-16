<template>
  <div class="min-h-[70vh] py-8 bg-surface-hover/20">
    <div class="container-width max-w-7xl">
      <h1 class="text-3xl font-bold mb-8">
        {{ isQuoteMode ? 'Quote Request' : 'Checkout' }}
      </h1>

      <!-- Step indicator -->
      <div class="flex justify-between max-w-2xl mb-8 px-2">
        <template v-for="(label, i) in stepLabels" :key="label">
          <div v-if="i > 0" class="flex-1 border-t-2 border-dashed border-muted mx-4 mt-4" />
          <div
            :class="[
              'flex items-center gap-2',
              currentStep === i + 1 ? 'text-primary font-bold' : currentStep > i + 1 ? 'text-secondary' : 'text-muted-foreground',
            ]"
          >
            <div
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm',
                currentStep === i + 1 ? 'border-primary bg-primary text-primary-foreground' : currentStep > i + 1 ? 'border-secondary bg-secondary/10 text-secondary' : 'border-muted-foreground/30',
              ]"
            >
              <svg v-if="currentStep > i + 1" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span v-else>{{ i + 1 }}</span>
            </div>
            <span class="hidden md:inline">{{ label }}</span>
          </div>
        </template>
      </div>

      <ClientOnly>
        <div class="flex flex-col lg:flex-row gap-8">
          <div class="lg:w-2/3 space-y-6">
            <div v-if="error" class="bg-destructive/10 border border-destructive/20 p-4 rounded-[var(--radius-control)] text-destructive text-sm font-medium">
              {{ error }}
            </div>

            <!-- Step 1: Invoice Address -->
            <div :class="['bg-card rounded-[var(--radius-container)] shadow border', currentStep === 1 ? 'ring-2 ring-primary border-primary' : 'opacity-80']">
              <div class="p-6 cursor-pointer" @click="currentStep > 1 && (currentStep = 1)">
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">1. Invoice Address</h2>
                  <span v-if="currentStep > 1 && cart?.invoiceAddress?.street" class="text-sm text-muted-foreground border border-muted rounded px-2 py-0.5">
                    {{ cart.invoiceAddress.street }} {{ cart.invoiceAddress.number }}, {{ cart.invoiceAddress.city }}
                  </span>
                </div>
              </div>
              <div v-if="currentStep === 1" class="px-6 pb-6 space-y-4">
                <AddressCard
                  v-if="cart?.invoiceAddress?.street"
                  :address="cart.invoiceAddress as any"
                  :showEmail="true"
                  :showFullName="true"
                  :showStreet="true"
                  :showPostalCode="true"
                  :showCity="true"
                  :showCountry="true"
                  :showNumberExtension="true"
                  :enableDelete="false"
                  :enableSetDefault="false"
                  :onEdit="(addr: any) => handleAddressSubmit(addr, 'INVOICE', false)"
                  :countries="COUNTRIES"
                  :labels="addressCardLabels"
                />
                <template v-else>
                  <AddressCard
                    :address="null"
                    :inline="true"
                    :isNew="true"
                    addressType="INVOICE"
                    :showIcp="false"
                    :beforeSave="() => { loading = true; error = null; }"
                    :onEdit="(addr: any) => handleAddressSubmit(addr, 'INVOICE')"
                    :countries="COUNTRIES"
                    :labels="addressCardLabels"
                  />
                  <label v-if="!authStore.isAuthenticated" class="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" v-model="sameAsInvoice" class="rounded border-input text-primary focus:ring-primary" />
                    Delivery address same as invoice address
                  </label>
                </template>
                <button v-if="cart?.invoiceAddress?.street" @click="currentStep = 2" class="bg-primary text-primary-foreground px-6 py-2 rounded-[var(--radius-container)] hover:bg-primary/90 transition">
                  Confirm Invoice Address
                </button>
              </div>
            </div>

            <!-- Step 2: Delivery Address -->
            <div :class="['bg-card rounded-[var(--radius-container)] shadow border', currentStep === 2 ? 'ring-2 ring-primary border-primary' : 'opacity-80']">
              <div class="p-6 cursor-pointer" @click="currentStep > 2 && (currentStep = 2)">
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">2. Shipping Address</h2>
                  <span v-if="currentStep > 2 && cart?.deliveryAddress?.street" class="text-sm text-muted-foreground border border-muted rounded px-2 py-0.5">
                    {{ cart.deliveryAddress.street }} {{ cart.deliveryAddress.number }}, {{ cart.deliveryAddress.city }}
                  </span>
                </div>
              </div>
              <div v-if="currentStep === 2" class="px-6 pb-6 space-y-4">
                <template v-if="cart?.deliveryAddress?.street">
                  <AddressCard
                    :address="cart.deliveryAddress as any"
                    :showEmail="true"
                    :showFullName="true"
                    :showStreet="true"
                    :showPostalCode="true"
                    :showCity="true"
                    :showCountry="true"
                    :showNumberExtension="true"
                    :enableDelete="false"
                    :enableSetDefault="false"
                    :enableEdit="true"
                    :onEdit="(addr: any) => handleAddressSubmit(addr, 'DELIVERY', false)"
                    :countries="COUNTRIES"
                    :labels="addressCardLabels"
                  />
                  <div class="flex items-center gap-4">
                    <button @click="currentStep = 1" class="px-6 py-2 border rounded-[var(--radius-container)] hover:bg-surface-hover transition">Back</button>
                    <button @click="currentStep = 3" class="bg-primary text-primary-foreground px-6 py-2 rounded-[var(--radius-container)] hover:bg-primary/90 transition">Confirm Delivery Address</button>
                    <AddressSelector
                      v-if="authStore.isAuthenticated"
                      :addressType="AddressType.delivery"
                      :onAddressSelected="(addr: any) => handleAddressSubmit(addr, 'DELIVERY', true)"
                      :countries="COUNTRIES"
                      :labels="addressSelectorLabels"
                      class="ml-auto"
                    />
                  </div>
                </template>
                <template v-else>
                  <AddressCard
                    :address="null"
                    :inline="true"
                    :isNew="true"
                    addressType="DELIVERY"
                    :showIcp="false"
                    :beforeSave="() => { loading = true; error = null; }"
                    :onEdit="(addr: any) => handleAddressSubmit(addr, 'DELIVERY')"
                    :countries="COUNTRIES"
                    :labels="addressCardLabels"
                  />
                </template>
              </div>
            </div>

            <!-- Step 3: Payment & Delivery (normal mode only) -->
            <div v-if="!isQuoteMode" :class="['bg-card rounded-[var(--radius-container)] shadow border', currentStep === 3 ? 'ring-2 ring-primary border-primary' : 'opacity-80']">
              <div class="p-6 cursor-pointer" @click="currentStep > 3 && (currentStep = 3)">
                <h2 class="text-lg font-semibold">3. Payment &amp; Delivery</h2>
              </div>
              <div v-if="currentStep === 3" class="px-6 pb-6 space-y-8">
                <div class="space-y-3">
                  <h3 class="font-semibold text-sm uppercase tracking-wide">Payment Method</h3>
                  <p v-if="step3Submitted && !selectedPayment" class="text-sm text-destructive">Please select a payment method</p>
                  <CartPaymethods v-if="cart" :cart="cart as any" :onPaymethodSelect="(pm: any) => (selectedPayment = pm.code)" :labels="cartPaymethodsLabels" />
                </div>
                <div class="space-y-3">
                  <h3 class="font-semibold text-sm uppercase tracking-wide">Carrier</h3>
                  <p v-if="step3Submitted && ((cart as any)?.carriers?.length ?? 0) > 0 && !selectedCarrier" class="text-sm text-destructive">Please select a carrier</p>
                  <CartCarriers v-if="cart" :cart="cart as any" :showPrice="false" :onCarrierSelect="(c: any) => (selectedCarrier = c.name)" :labels="cartCarriersLabels" />
                </div>
                <div class="space-y-3">
                  <h3 class="font-semibold text-sm uppercase tracking-wide">Delivery Date</h3>
                  <p v-if="step3Submitted && !selectedDeliveryDate" class="text-sm text-destructive">Please select a delivery date</p>
                  <DeliveryDate
                    v-if="cart"
                    :cart="cart as any"
                    :initialDate="(cart as any)?.postageData?.requestDate"
                    :onDateSelect="(d: string) => (selectedDeliveryDate = d)"
                    :showUpcomingDays="3"
                    :skipWeekends="true"
                    :showDatePicker="true"
                    :labels="deliveryDateLabels"
                  />
                </div>
                <div class="flex gap-4 pt-4">
                  <button @click="currentStep = 2" class="px-6 py-2 border rounded-[var(--radius-container)] hover:bg-surface-hover transition">Back</button>
                  <button @click="handleStep3Continue" :disabled="loading" class="bg-primary text-primary-foreground px-6 py-2 rounded-[var(--radius-container)] disabled:opacity-50 hover:bg-primary/90 transition">
                    {{ loading ? 'Saving...' : 'Continue to Review' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Step 3 (quote) / Step 4 (normal): Review -->
            <div :class="['bg-card rounded-[var(--radius-container)] shadow border', currentStep === reviewStep ? 'ring-2 ring-primary border-primary' : 'opacity-80']">
              <div class="p-6">
                <h2 class="text-lg font-semibold">{{ reviewStep }}. {{ isQuoteMode ? 'Quote Details' : 'Review & Place Order' }}</h2>
              </div>
              <div v-if="currentStep === reviewStep" class="px-6 pb-6 space-y-6">
                <template v-if="isQuoteMode">
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-muted-foreground" for="quote-reference">Reference</label>
                    <input id="quote-reference" type="text" v-model="quoteReference" placeholder="Your reference (optional)" maxlength="255" class="w-full border border-input rounded-[var(--radius-control)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-sm font-medium text-muted-foreground" for="quote-notes">Notes</label>
                    <textarea id="quote-notes" v-model="quoteNotes" placeholder="Additional notes for your quote request (optional)" rows="4" maxlength="255" class="w-full border border-input rounded-[var(--radius-control)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
                  </div>
                  <div class="flex gap-4 pt-2">
                    <button @click="currentStep = 2" class="px-6 py-2 border rounded-[var(--radius-container)] hover:bg-surface-hover transition">Back</button>
                    <button @click="handlePlaceOrder(quoteReference || undefined, quoteNotes || undefined)" :disabled="loading" class="bg-primary text-primary-foreground px-6 py-2 rounded-[var(--radius-container)] disabled:opacity-50 hover:bg-primary/90 transition">
                      {{ loading ? 'Submitting...' : 'Place Quote Request' }}
                    </button>
                  </div>
                </template>
                <template v-else>
                  <p
                    v-if="paymentStartError"
                    class="mb-4 rounded-[var(--radius-container)] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    role="alert"
                  >
                    {{ paymentStartError }}
                  </p>
                  <CartOverview
                    v-if="cart"
                    :cart="cart as any"
                    :showTermsAndConditions="true"
                    :showReference="true"
                    :showNotes="true"
                    :showPurchaseButton="true"
                    :onTermsAndConditionsClick="openTermsAndConditions"
                    :onPurchaseButtonClick="(_cart: any, reference: string, notes: string) => handlePlaceOrder(reference, notes)"
                    :labels="cartOverviewLabels"
                  />
                </template>
              </div>
            </div>
          </div>

          <!-- Order summary sidebar -->
          <div class="lg:w-1/3">
            <div class="sticky top-24 space-y-6">
              <div class="bg-card rounded-[var(--radius-container)] shadow border p-6">
                <h3 class="text-lg font-semibold mb-4">Cart Items</h3>
                <ItemsOverview
                  v-if="cart"
                  :cart="cart as any"
                  :showAvailability="false"
                  :itemNameClickable="false"
                  :showImage="true"
                  :showSku="true"
                  :showQuantity="true"
                  :showPrice="true"
                  :showStockComponent="true"
                  :isChildItem="true"
                  :labels="itemsOverviewLabels"
                />
              </div>
              <div class="bg-card rounded-[var(--radius-container)] shadow border p-6">
                <CartSummary
                  v-if="cart"
                  :cart="cart as any"
                  title="Order Summary"
                  :showCheckoutButton="false"
                  :afterRequestAuthorization="handleAfterRequestAuthorization"
                  :onError="(err: Error) => console.error('Authorization request failed:', err)"
                  :labels="cartSummaryLabels"
                />
              </div>
            </div>
          </div>
        </div>

        <template #fallback>
          <div class="space-y-4">
            <div v-for="i in 4" :key="i" class="h-24 animate-pulse rounded bg-muted" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { type Cart, AddressType } from '@propeller-commerce/propeller-sdk-v2';
import {
  AddressCard,
  AddressSelector,
  CartCarriers,
  CartOverview,
  CartPaymethods,
  CartSummary,
  DeliveryDate,
  ItemsOverview,
  useCheckout,
  type AnyUser,
} from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { configuration, localizeHref } from '~/utils/config';
import { COUNTRIES } from '~/utils/countries';
import { restoreManagerCart } from '~/utils/cartHelpers';
import { isOnAccountMethod, isMollieEnabled } from '~/utils/payments';
import { useTranslations } from '~/composables/useTranslations';

const addressCardLabels = useTranslations('AddressCard');
const addressSelectorLabels = useTranslations('AddressSelector');
const cartCarriersLabels = useTranslations('CartCarriers');
const cartOverviewLabels = useTranslations('CartOverview');
const cartPaymethodsLabels = useTranslations('CartPaymethods');
const cartSummaryLabels = useTranslations('CartSummary');
const molliePaymentLabels = useTranslations('MolliePayment');
const deliveryDateLabels = useTranslations('DeliveryDate');
const itemsOverviewLabels = useTranslations('ItemsOverview');

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const cartStore = useCartStore();
const languageStore = useLanguageStore();
const companyStore = useCompanyStore();

const { $graphqlClient } = useNuxtApp();

const { loading, error, updateCartAddress, updateCartSettings, placeOrder, getUserDefaultAddress, buildAddressInput } =
  useCheckout({
    graphqlClient: $graphqlClient as any,
    user: computed(() => authStore.user as AnyUser),
    companyId: computed(() => companyStore.companyId ?? undefined),
    language: computed(() => languageStore.language),
    configuration,
  });

const isQuoteMode = computed(() => route.query.mode === 'quote');
const reviewStep = computed(() => (isQuoteMode.value ? 3 : 4));
const stepLabels = computed(() =>
  isQuoteMode.value ? ['Details', 'Shipping', 'Review'] : ['Details', 'Shipping', 'Payment', 'Review']
);

const cart = computed(() => cartStore.cart);
const currentStep = ref(1);
const selectedPayment = ref('');
const selectedCarrier = ref('');
const selectedDeliveryDate = ref('');
const sameAsInvoice = ref(false);
const step3Submitted = ref(false);
const quoteReference = ref('');
const quoteNotes = ref('');
const orderPlaced = ref(false);
// Idempotency guard for the PSP retry path: placeOrder converts the cart to an
// order server-side, and a payment-start failure keeps the cart for retry.
// Without this, a second Place Order click re-runs placeOrder on the SAME cart
// and (if the backend isn't idempotent) strands another UNFINISHED order. We
// remember the orderId this cart already produced and, on retry, skip straight
// to starting payment for that same order.
const placedOrder = ref<{ cartId: string; orderId: number } | null>(null);
// Surfaced when starting the Mollie payment fails after the order was placed —
// the order stays UNFINISHED and the cart is kept, so the shopper can retry.
const paymentStartError = ref('');

// Public runtime config. Read via useRuntimeConfig().public — NOT
// process.env.NUXT_PUBLIC_* (Nuxt doesn't inline that into the client bundle,
// so it's undefined in the browser; see app/utils/payments.ts).
const publicConfig = useRuntimeConfig().public as {
  siteUrl?: string;
  currencyCode?: string;
  paymentProvider?: string;
  onAccountPayments?: string;
};

let lastInitCart: any = null;

async function initializeCheckout() {
  const c = cart.value as any;
  if (!c || !c.items || c.items.length === 0) {
    if (!orderPlaced.value) router.replace(localizeHref('/cart', languageStore.language));
    return;
  }
  if (
    lastInitCart &&
    lastInitCart.cartId === c.cartId &&
    lastInitCart.invoiceAddress?.street === c.invoiceAddress?.street &&
    lastInitCart.deliveryAddress?.street === c.deliveryAddress?.street
  )
    return;
  lastInitCart = c;

  const hasInvoice = !!c.invoiceAddress?.street;
  const hasDelivery = !!c.deliveryAddress?.street;

  if (authStore.isAuthenticated && (!hasInvoice || !hasDelivery)) {
    try {
      let updatedCart: Cart = c as Cart;
      if (!hasInvoice) {
        const defaultInvoice = getUserDefaultAddress('invoice');
        if (defaultInvoice) {
          const result = await updateCartAddress(updatedCart.cartId, 'INVOICE', defaultInvoice);
          if (result) updatedCart = result;
        }
      }
      if (!hasDelivery) {
        const defaultDelivery = getUserDefaultAddress('delivery');
        if (defaultDelivery) {
          const result = await updateCartAddress(updatedCart.cartId, 'DELIVERY', defaultDelivery);
          if (result) updatedCart = result;
        }
      }
      cartStore.setCart(updatedCart);
    } catch (e) {
      console.error('Error pre-populating cart addresses:', e);
    }
  }

  const finalCart = cart.value as any;
  const updatedHasInvoice = !!finalCart?.invoiceAddress?.street;
  const updatedHasDelivery = !!finalCart?.deliveryAddress?.street;
  if (updatedHasInvoice && updatedHasDelivery) currentStep.value = 3;
  else if (updatedHasInvoice) currentStep.value = 2;
  else currentStep.value = 1;
}

async function handleAddressSubmit(addressData: any, type: 'INVOICE' | 'DELIVERY', advance = true) {
  const updatedCart = await updateCartAddress((cart.value as any).cartId, type, addressData);
  if (!updatedCart) return;
  cartStore.setCart(updatedCart);

  if (advance && type === 'INVOICE' && !authStore.isAuthenticated && sameAsInvoice.value) {
    const deliveryInput = buildAddressInput('DELIVERY', addressData);
    const deliveryCart = await updateCartAddress(updatedCart.cartId, 'DELIVERY', deliveryInput);
    if (deliveryCart) cartStore.setCart(deliveryCart);
    currentStep.value = 3;
    return;
  }

  if (advance) {
    const hasInvoice = !!(updatedCart as any).invoiceAddress?.street;
    const hasDelivery = !!(updatedCart as any).deliveryAddress?.street;
    if (hasInvoice && hasDelivery) currentStep.value = 3;
    else if (hasInvoice) currentStep.value = 2;
    else currentStep.value = currentStep.value + 1;
  }
}

function computeFirstDeliveryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00Z`;
}

const autoAdvancedCartId = ref<string | null>(null);

watch(
  [currentStep, cart, isQuoteMode],
  async () => {
    if (currentStep.value !== 3) return;
    if (isQuoteMode.value) return;
    const c = cart.value as any;
    if (!c?.cartId) return;
    if (autoAdvancedCartId.value === c.cartId) return;
    const payMethods = (c.payMethods ?? []) as { code?: string }[];
    const carriers = (c.carriers ?? []) as { name?: string }[];
    if (payMethods.length !== 1) return;
    if (carriers.length > 1) return;
    const onlyPayment = payMethods[0]?.code;
    const onlyCarrier = carriers[0]?.name;
    if (!onlyPayment) return;
    const requestDate = (c.postageData?.requestDate as string | undefined) || computeFirstDeliveryDate();
    autoAdvancedCartId.value = c.cartId;
    try {
      const updatedCart = await updateCartSettings(c.cartId, {
        paymentMethod: onlyPayment,
        ...(onlyCarrier ? { carrier: onlyCarrier } : {}),
        requestDate,
      });
      if (updatedCart) {
        cartStore.setCart(updatedCart);
        selectedPayment.value = onlyPayment;
        selectedCarrier.value = onlyCarrier ?? '';
        selectedDeliveryDate.value = requestDate;
        currentStep.value = 4;
      }
    } catch (e) {
      autoAdvancedCartId.value = null;
      console.error('[checkout] auto-advance step 3 failed:', e);
    }
  },
  { immediate: true }
);

async function handleStep3Continue() {
  const hasCarriers = ((cart.value as any)?.carriers?.length ?? 0) > 0;
  if (!selectedPayment.value || (hasCarriers && !selectedCarrier.value) || !selectedDeliveryDate.value) {
    step3Submitted.value = true;
    return;
  }
  const updatedCart = await updateCartSettings((cart.value as any).cartId, {
    paymentMethod: selectedPayment.value,
    ...(selectedCarrier.value ? { carrier: selectedCarrier.value } : {}),
    requestDate: selectedDeliveryDate.value,
  });
  if (updatedCart) {
    cartStore.setCart(updatedCart);
    currentStep.value = 4;
  }
}

async function handlePlaceOrder(reference?: string, notes?: string) {
  orderPlaced.value = true;
  paymentStartError.value = '';

  const quote = isQuoteMode.value;
  const onAccount = isOnAccountMethod(publicConfig, selectedPayment.value);
  // PSP path only when Mollie is on, it's a real sale, and the method isn't
  // settled on account.
  const goesThroughMollie = !quote && !onAccount && isMollieEnabled(publicConfig);

  // quote → REQUEST · via Mollie → UNFINISHED (the webhook finalizes it on
  // `paid`) · everything else → NEW (settled immediately, no PSP).
  const orderStatus = quote ? 'REQUEST' : goesThroughMollie ? 'UNFINISHED' : 'NEW';

  const cartId = (cart.value as any).cartId;

  // Retry after a payment-start failure: this cart was already converted to an
  // order by a prior placeOrder. Reuse that orderId and re-run only the Mollie
  // hand-off instead of placing the order again (which would strand a duplicate
  // UNFINISHED order on a non-idempotent backend).
  const alreadyPlaced =
    goesThroughMollie && placedOrder.value?.cartId === cartId
      ? placedOrder.value.orderId
      : null;

  const result = alreadyPlaced
    ? ({ ok: true as const, data: { orderId: alreadyPlaced } })
    : await placeOrder(cartId, {
        isQuoteMode: quote,
        reference,
        notes,
        orderStatus,
        // A Mollie order is finalized later by the payment webhook (on paid): don't
        // send the confirmation email / clear the backend cart at placement.
        ...(goesThroughMollie ? { finalizeOrder: false } : {}),
      });

  if (!result.ok) {
    orderPlaced.value = false;
    return;
  }

  const orderId = result.data.orderId;
  // Remember the order this cart produced so a payment-start retry reuses it.
  // Only PSP orders keep the cart around to retry against.
  if (goesThroughMollie) placedOrder.value = { cartId, orderId };

  // PSP step: hand off to Mollie's hosted checkout.
  if (goesThroughMollie) {
    const checkoutUrl = await startMolliePayment(orderId);
    if (checkoutUrl) {
      window.location.href = checkoutUrl; // hard redirect off-site
      return;
    }
    // Start failed: keep the cart, surface the error, let them retry. The order
    // stays UNFINISHED — Mollie can still be retried, or it ages out.
    orderPlaced.value = false;
    paymentStartError.value =
      molliePaymentLabels.value.startFailed ?? 'Could not start the payment. Please try again.';
    return;
  }

  // Non-PSP path (on-account / quote / Mollie off): unchanged behaviour.
  // Restore the manager's parked cart if they were acting on a requester's
  // authorization cart; otherwise clear.
  cartStore.setCart(restoreManagerCart());
  const thankYouUrl =
    localizeHref(`/checkout/thank-you/${orderId}`, languageStore.language) +
    (quote ? '?mode=quote' : '');
  router.push(thankYouUrl);
}

/**
 * Create the Mollie payment for a just-placed order and return its hosted
 * checkout URL (or null on failure). Stashes the Mollie payment id in
 * sessionStorage so the return page can resolve the real outcome — Mollie sends
 * every outcome back to the same redirect URL.
 */
async function startMolliePayment(orderId: number): Promise<string | null> {
  try {
    const total = (cart.value as any)?.total;
    // Mollie collects the gross (incl. VAT) amount the shopper pays.
    const amount = total?.totalGross ?? total?.totalNet;
    if (amount === undefined || amount === null) return null;

    const origin = (publicConfig.siteUrl || window.location.origin).replace(/\/$/, '');
    // `psp=mollie` marks this as a PSP return so the thank-you page resolves the
    // real payment outcome instead of assuming success.
    const redirectUrl =
      origin +
      localizeHref(`/checkout/thank-you/${orderId}`, languageStore.language) +
      '?psp=mollie';

    const res = await fetch('/api/mollie/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        amount,
        currency: publicConfig.currencyCode || 'EUR',
        method: selectedPayment.value,
        description: `Order ${orderId}`,
        redirectUrl,
        ...(authStore.user?.userId ? { userId: Number(authStore.user.userId) } : {}),
      }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { checkoutUrl?: string; paymentId?: string };
    if (data.paymentId && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(`mollie_payment_${orderId}`, data.paymentId);
      } catch {
        /* sessionStorage unavailable — the return page falls back to order status */
      }
    }
    return data.checkoutUrl ?? null;
  } catch (e) {
    console.error('startMolliePayment failed', e);
    return null;
  }
}

function openTermsAndConditions() {
  window.open('/terms-conditions', '_blank');
}

function handleAfterRequestAuthorization(updatedCart: Cart) {
  cartStore.setCart(restoreManagerCart());
  router.push(localizeHref(`/authorization-request-sent/${updatedCart.cartId}`, languageStore.language));
}

watch([() => cartStore.cart, () => authStore.isAuthenticated], () => { initializeCheckout(); }, { immediate: false });
onMounted(() => initializeCheckout());

useHead({ title: 'Checkout' });
</script>
