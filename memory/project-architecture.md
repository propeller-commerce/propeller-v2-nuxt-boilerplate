---
name: project-architecture
description: Three-consumer matrix, two-tier DI, who owns what in propeller-nuxt
metadata:
  type: project
---

**Fact**: propeller-nuxt is the third storefront consumer in a three-app matrix:

- `propeller-next` (Next 16 + React) — original, consumes `propeller-v2-react-ui`.
- `propeller-vue` (Vue 3 + Vite SPA) — Vue port, consumes `propeller-v2-vue-ui`.
- `propeller-nuxt` (Nuxt 3 SSR, this repo) — Vue SSR sibling, consumes `propeller-v2-vue-ui`.

All three share one headless backend (Helice/Propeller staging at
`https://api.staging.helice.cloud/v2/graphql`), one cache-tag scheme, one
`/api/revalidate` webhook contract, and the same `localizeHref`/language
URL strategy (NL unprefixed, EN at `/en/`).

**Why**: round out the consumer matrix so the same headless backend powers
a Nuxt SSR app. Lets the Vue UI package's `reactive()` provider get
validated against a real SSR/hydration boundary.

**How to apply**:
- Two-tier DI is identical across consumers. Tier 1 (Vite/Nuxt plugin)
  installs `{ graphqlClient, services, currency, configuration }`. Tier 2
  (provider in root) wraps everything in `<PropellerProvider>` with
  reactive props from stores (auth/company/language/price/portalMode).
- This project owns: routes, layouts, Pinia stores, server cache layer,
  i18n dictionaries, env wiring, host bridge, a thin AppHeader/AppFooter/
  AccountSidebar set.
- This project does NOT own UI components. Cards/grid/filters/toolbar/cart/
  account widgets all come from `propeller-v2-vue-ui`. Don't reimplement.

Related: [[project-hybrid-ssr]], [[project-pinia-stores]], [[project-package-consumption]].
