# Propeller Nuxt E-commerce

A Nuxt 3 SSR e-commerce storefront powered by `propeller-sdk-v2` and
`propeller-v2-vue-ui`. Third consumer in the trio alongside
[propeller-next](https://gitlab.com/propellor-eu/cloud/frontend/dev-sites/next-boilerplate)
(Next 16 / React) and
[propeller-vue](https://gitlab.com/propellor-eu/cloud/frontend/dev-sites/vue-boilerplate)
(Vue 3 / Vite SPA). Same backend, same routes, same cache + revalidate
contract — Nuxt SSR.

## Features

- Hybrid SSR catalog (category / search / cluster / product)
- Anonymous-only fetch cache with per-entity tags + `/api/revalidate` webhook
- Shopping cart, checkout, account, blog, CMS — full route parity with the
  Next/Vue consumers
- Pinia stores for auth / cart / company / language / price (1:1 mirror of
  propeller-vue)
- `@nuxtjs/i18n` with `prefix_except_default` strategy (NL unprefixed, /en/
  prefix)
- Translations resolved through `app/composables/useTranslations.ts`,
  falling back to package defaults

## Tech Stack

- **Nuxt 3.14** with `compatibilityVersion: 4` (Nuxt 4 defaults: `srcDir: app/`)
- **Vue 3.5** (Composition API, `<script setup>`)
- **TypeScript** (strict)
- **Tailwind CSS 4** via `@nuxtjs/tailwindcss` v7-beta (CSS-based `@source`
  scanning)
- **Pinia** (`@pinia/nuxt`) for stores
- **`@propeller-commerce/propeller-sdk-v2`** for GraphQL — server-direct
  with apikey, client-proxied through `/api/graphql`
- **`propeller-v2-vue-ui`** for the storefront component library (pinned via
  `github:propeller-commerce/propeller-v2-vue-ui#master`)

> **Architecture note.** All visible UI surface lives in the
> `propeller-v2-vue-ui` package — `<ProductCard>`, `<AddToCart>`,
> `<ProductGrid>`, `<CartSidebar>`, etc. This app holds page-level shells
> (`app/pages/*.vue`), the layout chrome (`app/components/layout/`), the
> server seam (`server/utils/`), and configuration. Component fixes go to
> the package repo.

## Getting Started

### Prerequisites

- Node.js 22+
- npm
- Access to the Propeller staging GraphQL endpoint

### Installation

```bash
git clone https://gitlab.com/propellor-eu/cloud/frontend/dev-sites/nuxt-boilerplate.git propeller-nuxt
cd propeller-nuxt
cp .env.example .env
# fill in BOILERPLATE_GRAPHQL_ENDPOINT, BOILERPLATE_API_KEY, REVALIDATE_SECRET, ...
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If a previous Nuxt instance left a lock file, either kill the orphan node
process (Windows: `Stop-Process -Id <PID> -Force` in PowerShell — Git Bash's
`taskkill /PID` is parsed as a path) or bypass the lock with
`NUXT_IGNORE_LOCK=1 npm run dev`.

## Project Structure

```
├── app/                          # Nuxt 4 app/ source root
│   ├── app.vue                   # Tier-2 <PropellerProvider> mount + <NuxtLayout>
│   ├── pages/                    # File-based routes
│   │   ├── index.vue             # Home (featured ProductSlider)
│   │   ├── category/[id]/[slug].vue   # Hybrid SSR shell + ProductGrid island
│   │   ├── product/[productId]/[slug].vue
│   │   ├── cluster/[clusterId]/[slug].vue
│   │   ├── search.vue            # ?q=term canonical
│   │   ├── search/[...term].vue  # /search/foo legacy alias → redirect
│   │   ├── cart.vue
│   │   ├── checkout/             # 4-step checkout + thank-you
│   │   ├── account/              # 11 sub-routes, all middleware: 'auth'
│   │   ├── login.vue, register.vue, forgot-password.vue
│   │   ├── blog/                 # Blog index + slug
│   │   └── [...slug].vue         # CMS catch-all (lowest precedence)
│   ├── components/layout/        # AppHeader, AppFooter, AccountSidebar
│   ├── layouts/                  # default, account
│   ├── middleware/               # auth, language.global
│   ├── plugins/                  # propeller.ts (Tier 1), hydrate-stores.client.ts
│   ├── stores/                   # auth, cart, company, language, menu, price, ssrCatalog
│   ├── composables/              # useTranslations, useListingParams
│   ├── utils/                    # config (canonical from propeller-vue),
│   │                             # seo, countries, cartHelpers, ssr
│   └── assets/css/app.css        # Brand palette + tokens + layout safety nets
├── server/                       # Nitro server context
│   ├── api/
│   │   ├── catalog/              # category/product/cluster/search/menu .get.ts
│   │   ├── revalidate.post.ts    # Webhook (REVALIDATE_SECRET-gated)
│   │   ├── graphql.ts            # SDK proxy (injects apikey upstream)
│   │   └── auth/session.post.ts  # httpOnly cookie writer
│   └── utils/
│       ├── tags.ts               # tagFor + TAG_CATALOG + TTL constants
│       ├── cache.ts              # cachedSdkFetch wrapper + tag-index storage
│       ├── infra.ts              # getServerInfra/getAnonymousInfra/getListingInfra
│       └── fetchers.ts           # fetchProduct/Category/Search/Cluster/Menu
├── i18n/locales/                 # nl.json, en.json (top-level UI)
├── memory/                       # Project memory notes for Claude Code
├── nuxt.config.ts                # Modules, runtime config, hooks (Tailwind sources)
└── tailwind.config.ts            # content paths (mostly bypassed by v7-beta)
```

## Rendering (Hybrid SSR)

This is a **hybrid SSR app**, not a SPA. Nuxt renders server-first; pages
opt into client islands only where they need interactivity.

**Server-rendered shells.** Catalog routes — `category`, `search`,
`cluster`, `product` — fetch via `useFetch('/api/catalog/...')` which calls
into `server/utils/fetchers.ts`. The result seeds the page's
`<PropellerProvider>` and the package's `<ProductGrid>` / `<ProductPrice>`
/ `<Breadcrumbs>` etc. Server emits real product content, prices and SEO
metadata in the initial HTML.

**Why `<ClientOnly>` around interactive package components.** The package's
`<ProductGrid>`, `<GridFilters>`, `<GridToolbar>` weren't designed to
render under Nuxt SSR (they reach for `.length` on undefined props during
the server pass). They're wrapped in `<ClientOnly>` with skeleton
fallbacks; hydration delivers the real component with the seeded data via
`__NUXT__` payload — no second fetch. Static pieces (`<GridTitle>`,
`<CategoryDescription>`, JSON-LD scripts) render server-side without the
boundary.

**`generateMetadata` equivalent.** Each catalog page emits per-page
`<title>`, `<meta description>`, canonical and OpenGraph tags via
`useHead()`, resolved from the backend's localized `metadata*` fields via
helpers in `app/utils/seo.ts`. `buildJsonLdContext()` produces the
`JsonLdContext` consumed by `<ItemListJsonLd>` / `<ProductJsonLd>` /
`<ClusterJsonLd>`.

### Caching (anonymous-only)

Anonymous catalog GraphQL reads go through `server/utils/cache.ts`'s
`cachedSdkFetch` wrapper, backed by `useStorage('cache')` (memory driver
in dev, Redis in prod). Logged-in users bypass automatically — the cookie
read in `getServerInfra()` flips `cacheable: false`.

- Source of truth for tags: `tagFor(entity, id?)` in `server/utils/tags.ts`.
  Never inline literals like `'product:42'`.
- TTL: `ANONYMOUS_CACHE_TTL_SECONDS = 300`.
- Bust by tag: `POST /api/revalidate` with header `X-Revalidate-Secret`
  matching `REVALIDATE_SECRET`, body `{ "tag": "product:42" }`. Pass
  `{"tag":"*"}` for a nuclear wipe — the route rewrites it to
  `TAG_CATALOG`, which every anonymous cache entry carries as an umbrella.
- Storage driver: dev uses `memory` (set in `nitro.devStorage` —
  `nuxt.config.ts`). Production should point `cache` at Redis. The wrapper
  is driver-agnostic; the wire shape is identical.
- The fs driver chokes on `:` chars in cache keys — don't switch dev back
  to fs without re-encoding keys first.

The contract is **byte-identical to propeller-next** — the same backend
webhook drives both apps.

### Tier 1 vs Tier 2 wiring

- **Tier 1** (`app/plugins/propeller.ts`) — installs the package's
  `propellerVue` Vue plugin with `{ graphqlClient, services, currency,
  configuration }`. Runs server + client per-request (Nuxt's plugin scope
  is per-request on the server, so each request gets its own
  GraphQLClient — no cross-request auth leakage).
  - **Server:** `securityMode: 'direct'`, apikey from
    `BOILERPLATE_API_KEY` (server-only env, never bundled).
  - **Client:** `securityMode: 'proxy'`, hits `/api/graphql` — the Nitro
    handler injects the apikey upstream. Apikeys NEVER reach the browser
    bundle.
- **Tier 2** (`app/app.vue`) — `<PropellerProvider>` with reactive props
  from Pinia stores (`auth.user`, `company.companyId`, `language.language`,
  `price.includeTax`, `config.public.portalMode`).

### Client–server Tier-2 scope handshake

The catalog `useFetch` calls forward `companyId` as an explicit query
param (`?companyId=42`) — not just a cookie. Why:

- Cookies aren't reliable across Nuxt's `$fetch` dedup pipeline (the
  client-side payload cache keys on URL + payload; cookie state isn't
  part of either).
- Query params make the dependency visible to `useFetch`'s `watch:` and
  `key:` callbacks, so a company switch triggers exactly one re-fetch.
- The server endpoint reads the param via the `overrides` arg to
  `getListingInfra(event, { selectedCompanyId })`. Falls back to cookie
  if absent (for direct requests).

VAT toggle (`price.includeTax`) is a **pure display switch**, NOT a
re-fetch trigger. Both `price.gross` and `price.net` come back in every
catalog response; flipping `includeTax` just changes which value the
package's `<ProductPrice>` / `<ProductBulkPrices>` / `<ProductSlider>`
displays. We pass `:includeTax="priceStore.includeTax"` explicitly to
those components so the change propagates instantly with zero network
activity. (The package's `useInfraProps` checks explicit props first and
falls back to context; passing it explicitly skips the context
round-trip and removes any reactivity ambiguity.)

## Environment Variables

Copy `.env.example` to `.env`. Server-only vars are read by Nitro
endpoints and the SDK proxy — they **never reach the client bundle**.

**Server-only:**

- `BOILERPLATE_GRAPHQL_ENDPOINT` — upstream GraphQL API endpoint
- `BOILERPLATE_API_KEY` — apikey injected server-side by the proxy
- `BOILERPLATE_ORDER_EDITOR_API_KEY` — order-editor apikey
- `BOILERPLATE_PORTAL_MODE` — `open` / `semi-closed` / `closed` (kebab-case)
- `BOILERPLATE_DEFAULT_LANGUAGE` — `NL` (default)
- `BOILERPLATE_CURRENCY` — `€` (default)
- `REVALIDATE_SECRET` — required for `/api/revalidate`; without it the
  route returns 503
- `BASE_CATEGORY_ID` — root category ID (also exposed publicly)
- `CHANNEL_ID` — channel for order/quote listing filters (also exposed
  publicly)

**Public (`NUXT_PUBLIC_*` — inlined into the client bundle):**

- `NUXT_PUBLIC_GRAPHQL_ENDPOINT` — defaults to `/api/graphql` (the proxy).
  Only override when the SDK key is a public read-only credential.
- `NUXT_PUBLIC_SITE_URL` — absolute origin for JSON-LD payloads (no
  trailing slash). Empty by default → JSON-LD emits path-only URLs.
- `NUXT_PUBLIC_PORTAL_MODE`, `NUXT_PUBLIC_CURRENCY`,
  `NUXT_PUBLIC_CURRENCY_CODE`
- `NUXT_PUBLIC_URL_PATTERN` — `page/id/slug` (default)
- `NUXT_PUBLIC_MENU_DEPTH` — `3` (default)
- `NUXT_PUBLIC_SITE_NAME`, `NUXT_PUBLIC_LOGO_URL`, `NUXT_PUBLIC_LOGO_ALT`
- `NUXT_PUBLIC_FOOTER_DESCRIPTION`, `NUXT_PUBLIC_FOOTER_EMAIL`,
  `NUXT_PUBLIC_FOOTER_PHONE`

## Translations

UI strings emitted by `propeller-v2-vue-ui` components flow through
`app/composables/useTranslations.ts`. The stub currently returns `{}` so
the package falls back to English defaults baked into each component —
swap the stub with a per-namespace dictionary loader to localize.

The pattern mirrors propeller-vue's `lib/i18n/composable.ts`:

```ts
const labels = useTranslations('OrderList');  // ComputedRef<Record<string, string>>
```

Then in template: `<OrderList :labels="labels" ... />`. Vue auto-unwraps
the `ComputedRef` at the binding.

To populate translations, port the `locales/<lang>/<Component>.json`
files from propeller-vue's `frontend/src/locales/` and update
`useTranslations` to read from them. The slug list per component is in
the package's `getLabel(props.labels, slug, fallback)` calls.

## Authentication

- Auth token held in an **httpOnly cookie** (`access_token`) written by
  `/api/auth/session.post.ts` after login. NEVER readable from JS.
- Client requests go through `/api/graphql`; the Nitro handler attaches
  the cookie token as a Bearer header upstream.
- Server-side SDK calls (`getServerInfra`) read the cookie directly via
  H3's `getCookie(event, 'access_token')`.
- Protected routes (`/account/*`) use `middleware: 'auth'`. The
  middleware checks cookie server-side and Pinia auth store client-side,
  redirecting to `/login?redirect=<path>` if absent.

## Build for Production

```bash
npm run build
npm run preview   # local preview of the production build
```

Production deployment runs `node .output/server/index.mjs` after `npm run
build`. PM2 example: `pm2 start ".output/server/index.mjs" --name
nuxt-boilerplate`.

For production caching, switch the Nitro storage driver:

```ts
// nuxt.config.ts
nitro: {
  storage: {
    cache: { driver: 'redis', url: process.env.REDIS_URL },
  },
}
```

The `cachedSdkFetch` wrapper is driver-agnostic — the cache + tag-index
behavior is identical across drivers.

## Development Notes

- The harmless `Pre-transform error: Failed to resolve import
  "#app-manifest"` warning is Nuxt 3.14 ESM resolution noise around the
  app manifest virtual module. Page still renders.
- Tailwind v4 + `@nuxtjs/tailwindcss` v7-beta uses **CSS-based `@source`
  scanning**, not `tailwind.config.ts` `content`. The `nuxt.config.ts`
  `hooks: { 'tailwindcss:sources:extend' }` hook adds the package's
  `dist/` directory to the scan so utility classes used inside package
  components compile into the final CSS.
- Pinia store hydration: `app/plugins/hydrate-stores.client.ts` calls
  `cart.hydrateFromStorage()` + `company.hydrateFromStorage()` after Pinia
  payload restore, because the payload clobbers anything the store
  factory ran from `localStorage`.

## Cross-Consumer Sync

Three repos share the same upstream backend and headless contract:

| Repo | Stack | Where |
|---|---|---|
| propeller-next | Next 16 / React | `next-boilerplate` |
| propeller-vue | Vue 3 / Vite SPA | `vue-boilerplate` |
| **propeller-nuxt** | **Nuxt 3 / SSR** | **`nuxt-boilerplate` (this repo)** |

Changes to the shared package surface (`propeller-v2-vue-ui`,
`propeller-v2-react-ui`, `@propeller-commerce/propeller-sdk-v2`) ripple
across all three consumers. The cache + revalidate contract
(`tagFor`, `TAG_CATALOG`, `ANONYMOUS_CACHE_TTL_SECONDS`, the
`/api/revalidate` webhook body) is byte-identical across them by design —
the same backend webhook drives every consumer.

## License

Private — Propeller Commerce.
