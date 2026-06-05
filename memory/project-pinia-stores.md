---
name: project-pinia-stores
description: Seven Pinia stores mirror propeller-vue 1:1 — auth/cart/company/language/menu/price/ssrCatalog
metadata:
  type: project
---

**Fact**: `app/stores/*.ts` ports propeller-vue's stores 1:1:

| Store | File | Owns |
|---|---|---|
| auth | `auth.ts` | user, token, login/logout, session timeout, `isAuthManagerForCompany` |
| cart | `cart.ts` | active cart, itemCount, openCart/closeCart, localStorage persistence |
| company | `company.ts` | selectedCompany, companyId, sync from user, **cookie bridge** |
| language | `language.ts` | active language code (NL/EN), localStorage persistence |
| price | `price.ts` | includeTax (VAT toggle), **cookie bridge** |
| menu | `menu.ts` | seeded category tree from SSR menu fetch |
| ssrCatalog | `ssrCatalog.ts` | per-path catalog seed (`peekSeed`/`consumeSeed`); mostly redundant with `useAsyncData` payload |

All stores use the same `safeStorage` SSR-guard pattern from
`app/utils/ssr.ts` (port of propeller-vue's `lib/ssr.ts`).

**Why**: identical shape across the two Vue consumers means a fix to a
store (auth refresh logic, cart cross-tab sync, company switch) ports
verbatim. The shared backend cookies (`access_token`, `selected_company_id`,
`price_include_tax`) drive SSR personalisation across all three apps.

**How to apply**:
- New store? Port from propeller-vue and keep the same API surface.
- Reading auth in a layout/page? `useAuthStore().isAuthenticated`. On the
  server it's always false until the access_token cookie carries
  authentication info — the middleware does the redirect server-side via
  the cookie directly, not the store.
- Need post-hydration localStorage restore? `cart.hydrateFromStorage()` /
  `company.hydrateFromStorage()` — already wired by
  `app/plugins/hydrate-stores.client.ts`.
- Mutating a store from a non-Pinia context (event handler, callback)?
  Resolve the store inside the function (`const cart = useCartStore()`),
  not at module load — keeps per-request isolation under SSR.

Related: [[project-cookie-bridges]], [[project-architecture]].
