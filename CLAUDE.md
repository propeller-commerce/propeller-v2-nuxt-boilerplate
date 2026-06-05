# Claude operating notes — propeller-nuxt

Loaded into every Claude session for this project. Keep concise.

## What this project is

Nuxt 3 SSR storefront mirroring the propeller-next + propeller-vue consumer
apps, consuming the `propeller-v2-vue-ui` package. Same backend, same routes,
same cache + revalidate contract — just on Nuxt.

Three consumer apps share one headless backend:
- `propeller-next` (Next 16, React) — the original.
- `propeller-vue` (Vue 3 + Vite SPA) — Vue port.
- `propeller-nuxt` (Nuxt 3, this repo) — Vue SSR sibling.

Any change to the cache contract, tag scheme, revalidate webhook, or shared
package API MUST be considered against all three.

For the public-facing project description (features, env vars, build
commands), see `README.md`. This file holds Claude-operating notes only.

## Hybrid SSR

Catalog pages (category / search / cluster / product) use:
- `app/pages/<route>.vue` — Server-rendered shell + page-level `useFetch`.
- `/api/catalog/{category,product,cluster,search,menu}.get.ts` — Nitro
  endpoints that wrap the SDK with `cachedSdkFetch`.
- Interactive `<ProductGrid>` / `<GridFilters>` / `<GridToolbar>` from the
  package wrap inside `<ClientOnly>` (the package components weren't
  designed for SSR-only render — they reach for `.length` on undefined props
  during the server pass). The server pre-renders title + breadcrumb +
  cached data shell; the grid hydrates client-side with the seeded payload.

### Caching (anonymous-only)

Anonymous catalog reads go through `server/utils/cache.ts:cachedSdkFetch`
backed by `useStorage('cache')` with per-entity tags. Authenticated requests
bypass via the cookie read in `getServerInfra()`.

- Source of truth for tags: `tagFor(entity, id?)` in `server/utils/tags.ts`.
  Never inline literals like `'product:42'` — call `tagFor('product', 42)`.
- TTL: `ANONYMOUS_CACHE_TTL_SECONDS = 300`. Same as propeller-next.
- Bust by tag: `POST /api/revalidate` (gated by `REVALIDATE_SECRET`,
  body `{ "tag": "..." }`). `{"tag":"*"}` rewrites to `TAG_CATALOG` (umbrella
  on every anonymous entry).
- Storage driver: dev uses `memory` (set in `nitro.devStorage`). Production
  should point `cache` at Redis. The wrapper is driver-agnostic.
- The fs driver chokes on `:` chars in cache keys — do NOT switch dev back
  to fs without re-encoding keys first.

### Tier 1 vs Tier 2 wiring

- Tier 1 (`app/plugins/propeller.ts`) — installs the package's `propellerVue`
  plugin with `{ graphqlClient, services, currency, configuration }`. Runs
  per-request on the server, so each request has its own GraphQLClient
  (no cross-request auth leakage). Server uses `securityMode: 'direct'`
  with the apikey; client uses `securityMode: 'proxy'` against
  `/api/graphql` — apikeys NEVER reach the browser bundle.
- Tier 2 (`app/app.vue`) — `<PropellerProvider>` with reactive props from
  Pinia stores (auth/company/language/price). NO `refreshNuxtData()`
  watchers here — see [[feedback-no-double-refresh]].

### Catalog `useFetch` keying

Each catalog page bakes `companyStore.companyId` into its `useFetch`
`key:` + `watch:`. A company switch re-fetches automatically; do NOT
also call `refreshNuxtData()` from a handler — they race and the in-
flight request gets AbortController-canceled. `includeTax` stays OUT of
the key/watch — it's a pure display switch (both `price.gross` and
`price.net` come back in every response). Pass
`:includeTax="priceStore.includeTax"` explicitly to `<ProductGrid>`,
`<ProductPrice>`, `<ProductBulkPrices>`, `<ProductSlider>` instead.

### Tailwind v4 source scanning

`@nuxtjs/tailwindcss` v7-beta scans `srcDir` only by default — NOT
`tailwind.config.ts` `content`. The `hooks.tailwindcss:sources:extend`
hook in `nuxt.config.ts` adds `node_modules/propeller-v2-vue-ui/dist`
to the source list, so utility classes used INSIDE the package compile
into the final CSS bundle. Without this hook, `lg:w-64` (etc.) silently
goes missing and the catalog layout collapses.

### Server seam imports

Files in `server/utils/*` need explicit imports for cross-context use:
- `import { useStorage } from 'nitropack/runtime'` in `cache.ts`.
- `import { getCookie } from 'h3'` + `import { useRuntimeConfig } from 'nitropack/runtime'` in `infra.ts`.
- Pages should NOT dynamic-import `~~/server/utils/*` directly. Use
  `useFetch('/api/catalog/...')` instead — Nitro runs the handler in the
  same process, so there's no real HTTP roundtrip cost.

Auth middleware (`app/middleware/auth.ts`) imports `getCookie` from `'h3'`
explicitly — the auto-import doesn't reach all middleware paths.

## Pinia stores

Mirror propeller-vue 1:1 — auth, cart, company, language, menu, price,
ssrCatalog. SSR-safe via `app/utils/ssr.ts` (`isBrowser`, `safeStorage`,
`setBrowserCookie`, `deleteBrowserCookie`). The cookie bridges for
`selected_company_id` and `price_include_tax` are what server fetchers read
on the next SSR request.

Client-only `app/plugins/hydrate-stores.client.ts` calls
`cart.hydrateFromStorage()` + `company.hydrateFromStorage()` post-hydration
because Pinia's payload restore clobbers anything the store factory ran from
`localStorage` on the client side.

## Three repos in play

- `propeller-nuxt` (this repo) — the app.
- `propeller-v2-vue-ui` — Vue UI package, pinned via
  `github:propeller-commerce/propeller-v2-vue-ui#master` (GitLab→GitHub mirror).
  Edit components / composables / contexts in the package repo, not here.
- `@propeller-commerce/propeller-sdk-v2` — npm-scoped SDK package.

## Reference consumers

When in doubt about behaviour or wiring, check the equivalent in:
- `D:/laragon/www/propeller-next` (React/Next 16) — canonical SSR + cache
  semantics, `/api/revalidate` contract, `lib/server.ts` shape.
- `D:/laragon/www/propeller-vue` (Vue 3 + Vite SPA) — canonical Pinia store
  shape, `<PropellerProvider>` wiring, view layout.

## Run / debug

- `npm run dev` — boots on `http://localhost:3000/`. If a previous instance
  hung, the lock file blocks a new start: `NUXT_IGNORE_LOCK=1 npm run dev`
  or `Stop-Process -Id <PID> -Force` in PowerShell (Git Bash's
  `taskkill /PID` is parsed as a path).
- Harmless dev warnings: `Pre-transform error: Failed to resolve import
  "#app-manifest"` — known Nuxt 3.14 ESM resolution noise, page still renders.

## Memory

Project memory lives at `./memory/`. `MEMORY.md` is the index — read it first.
