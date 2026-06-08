---
name: feedback-header-handleAfterRequestAuthorization
description: AppHeader.handleAfterRequestAuthorization MUST call cartStore.setCart(restoreManagerCart()) before navigating to /authorization-request-sent. Without it, submitting a request from the sidebar leaves the cart parked in localStorage and the sidebar keeps showing items that no longer belong to a live cart.
metadata:
  type: feedback
---

**Rule:** in `app/components/layout/AppHeader.vue`, the
`handleAfterRequestAuthorization(cart)` function passed to
`<CartIconAndSidebar :afterRequestAuthorization>` MUST clear the cart
before navigating:

```ts
function handleAfterRequestAuthorization(cart: Cart) {
  cartStore.setCart(restoreManagerCart());  // ← REQUIRED
  router.push(localizeHref(`/authorization-request-sent/${cart.cartId}`, languageStore.language));
}
```

**Why:** the package's `<CartSummary>` component fires
`afterRequestAuthorization(props.cart)` after a successful
`requestPurchaseAuthorization` mutation. This callback fires no matter
where in the app `<CartSummary>` is mounted — including inside the
header's `<CartIconAndSidebar>`. The /cart page and /checkout page
both clear the cart before navigating to /authorization-request-sent;
the header MUST do the same. `restoreManagerCart()` returns:
- a parked manager cart from `localStorage['manager_cart']` if the
  user is a manager who parked their own cart to act on a request, OR
- `null` for a regular requester
Either way, `setCart(null)` removes the `cart` key from localStorage
via `safeStorage.removeItem('cart')` in the store's setCart() body —
and `setCart(parked)` restores the manager's cart.

**Past incident (2026-06-08):** the old code just did
`router.push(...)` with a comment saying "manager-cart parking handled
in the cart page; here just navigate". That comment was wrong —
manager-cart parking is only handled where the request is SUBMITTED,
and the header sidebar is one of three submission sites (the other
two being /cart and /checkout, both of which had the correct
clear-then-navigate shape from day one). Users reported the cart
persisting after submitting an authorization request from the header.

**Cross-consumer:** propeller-vue's `AppHeader.vue` (line 507) and
propeller-next's `Header.tsx` (line 432-438) both already had the
correct shape — this bug was Nuxt-only. See commit
`ac4a83d fix(header): clear cart after auth-request submitted from sidebar + restore logo`.

**How to apply:** any new component that wraps `<CartSummary>` (or
`<CartIconAndSidebar>` which embeds it) MUST decide what happens to
the cart after a successful auth-request. The default should be
`setCart(restoreManagerCart())` unless there's a deliberate reason
to keep the cart visible.

Related: [[project-architecture]], [[feedback-three-consumer-mirror]].
