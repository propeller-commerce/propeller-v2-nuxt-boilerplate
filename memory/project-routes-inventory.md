---
name: project-routes-inventory
description: Full route map and how each maps to propeller-next + propeller-vue
metadata:
  type: project
---

**Fact**: All routes from both reference apps are present, named after the
propeller-vue convention. Catalog routes are SSR + island; CSR shadows
under `/csr/*` exist for side-by-side comparison.

| Route | File | Type | Notes |
|---|---|---|---|
| `/` | `pages/index.vue` | SSR | Home with category/search/cart shortcuts |
| `/login` | `pages/login.vue` | SSR | `LoginForm` + `afterLogin` calls `/api/auth/session` |
| `/register` | `pages/register.vue` | SSR | `RegisterForm` + automatic-login flow |
| `/forgot-password` | `pages/forgot-password.vue` | SSR | `ForgotPassword` |
| `/terms-conditions` | `pages/terms-conditions.vue` | SSR | Placeholder |
| `/cart` | `pages/cart.vue` | SSR | `CartItem` x N + `CartSummary` + `ActionCode` + `CartBonusItems` |
| `/checkout` | `pages/checkout/index.vue` | SSR | 3-step (carriers → address → review), `?mode=quote` collapses to 2 steps |
| `/checkout/thank-you/[orderId]` | `pages/checkout/thank-you/[orderId].vue` | SSR | Order or quote-request thank-you |
| `/authorization-request-sent/[cartId]` | `pages/authorization-request-sent/[cartId].vue` | SSR | Confirmation |
| `/blog` + `/blog/[slug]` | `pages/blog/...` | SSR | Placeholder, wire to CMS |
| `/product/[productId]/[slug]` | `pages/product/[productId]/[slug].vue` | SSR + Island | Uses `/api/catalog/product` |
| `/category/[id]/[slug]` | `pages/category/[id]/[slug].vue` | SSR + Island | Uses `/api/catalog/category`, grid in `<ClientOnly>` |
| `/cluster/[clusterId]/[slug]` | `pages/cluster/[clusterId]/[slug].vue` | SSR + Island | Uses `/api/catalog/cluster` |
| `/search` | `pages/search.vue` | SSR + Island | `?q=...` (no path term) |
| `/search/[...term]` | `pages/search/[...term].vue` | SSR + Island | `/search/foo/bar` style |
| `/account` | `pages/account/index.vue` | SSR + Auth | `UserDetails`. Layout `account`, middleware `auth` |
| `/account/addresses` | `pages/account/addresses.vue` | SSR + Auth | `AddressCard` grid |
| `/account/orders` | `pages/account/orders/index.vue` | SSR + Auth | `OrderList` |
| `/account/orders/[id]` | `pages/account/orders/[id].vue` | SSR + Auth | `OrderSummary`, `OrderTotals`, `OrderActions` |
| `/account/quotes` | `pages/account/quotes/index.vue` | SSR + Auth | `OrderList type="quote"` |
| `/account/quotes/[id]` | `pages/account/quotes/[id].vue` | SSR + Auth | `OrderSummary`, `OrderTotals`, `QuoteActions` |
| `/account/quote-requests` | `pages/account/quote-requests/index.vue` | SSR + Auth | `OrderList type="quoteRequest"` |
| `/account/quote-requests/[id]` | `pages/account/quote-requests/[id].vue` | SSR + Auth | `OrderSummary`, `OrderTotals` |
| `/account/favorites` | `pages/account/favorites/index.vue` | SSR + Auth | `FavoriteLists` |
| `/account/favorites/[id]` | `pages/account/favorites/[id].vue` | SSR + Auth | `FavoriteListDetails` |
| `/account/invoices` | `pages/account/invoices.vue` | SSR + Auth | `OrderList type="invoice"` |
| `/account/price-requests` | `pages/account/price-requests.vue` | SSR + Auth | `OrderList type="priceRequest"` |
| `/account/authorization-requests` | `pages/account/authorization-requests.vue` | SSR + Auth | `PurchaseAuthorizationRequests` |
| `/account/authorization-settings` | `pages/account/authorization-settings.vue` | SSR + Auth | `PurchaseAuthorizationConfigurator` |
| `/csr/product/[productId]/[slug]` | `pages/csr/product/...` | CSR (`definePageMeta({ ssr: false })`) | `ProductInfo` |
| `/csr/category/[id]/[slug]` | `pages/csr/category/...` | CSR | `ProductGrid` + filter/toolbar |
| `/csr/cluster/[clusterId]/[slug]` | `pages/csr/cluster/...` | CSR | `ClusterInfo` |
| `/csr/search/[...term]` | `pages/csr/search/[...term].vue` | CSR | `ProductGrid` term path |
| `/[...slug]` | `pages/[...slug].vue` | SSR | CMS catch-all (last precedence) |

**Why**: complete route parity with propeller-next + propeller-vue keeps
the three apps comparable — any feature added to one has an obvious
landing in the others.

**How to apply**:
- Adding a route? Mirror propeller-next first, propeller-vue second. The
  Nuxt page file usually maps 1:1 to a propeller-vue view.
- Catalog page that fetches SDK data? Use `useFetch('/api/catalog/...')`.
- Account page? `definePageMeta({ layout: 'account', middleware: 'auth' })`.
- The CMS catch-all `[...slug].vue` must stay last; Nuxt resolves it as
  lowest precedence.

Related: [[project-hybrid-ssr]], [[project-package-consumption]].
