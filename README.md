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
- **`propeller-v2-vue-ui`** for the storefront component library (a real npm
  version — `0.17.0+`, whose favourite/list after-hooks report WHAT changed,
  which the tracking layer below needs)

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
- `PUNCHOUT_ENABLED` — master switch for PunchOut (`true`/`false`); see the
  [PunchOut](#punchout-oci--cxml) section
- `CXML_CONTACT_ID` — CSV of candidate buyer contact ids (their
  `CXML_SHARED_SECRET` attribute is matched against the request secret)
- `PUNCHOUT_DEBUG` — `true` renders a readable OCI/cXML preview instead of
  auto-posting to the ERP
- `PUNCHOUT_CURRENCY` / `PUNCHOUT_TRANSFER_TARGET` — optional (default `EUR` /
  `_self`)

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

## Behaviour tracking (`/tracker`) and GA4

The storefront emits its own event vocabulary on a tracking bus
(`app/lib/tracking/`, PWP-910). Two subscribers read that one stream: a batching
POST to `/api/track` (which writes MySQL) and a GA4 mapper. A tenant who wants
Segment or Snowplow instead writes a third mapper against the same events —
nothing else changes.

Mirrors propeller-next's implementation event-for-event, so reports are
comparable across all three storefronts.

46 of the 47 taxonomy names are wired. The last one, `propeller.quote_rejected`,
has no reject action anywhere to hook. The favourite events need
`propeller-v2-vue-ui` 0.17.0+: below that the toggle callback fires identically
for an add and a removal, and guessing the direction is worse than not
reporting at all.

| Piece | Where |
|---|---|
| Framework-free core (taxonomy, queue, GA4 item mapping) | `app/lib/tracking/{types,taxonomy,tracker,batch,items}.ts` |
| Browser facade + bootstrap | `app/lib/tracking/{bus,bootstrap,pageType}.ts` |
| Typed emit helpers | `app/lib/tracking/events.ts` |
| The one Nuxt-context read | `app/plugins/tracking.client.ts` |
| Ingest + metrics routes | `server/api/track.post.ts`, `server/api/tracker/index.get.ts` |
| Pool, metric queries, DDL | `server/utils/tracking{Db,Queries,Schema}.ts` |
| Schema installer | `scripts/tracking-init.ts` |
| Dashboard | `app/pages/tracker.vue`, `app/components/tracker/` |

### The analytics database

**Optional.** With nothing configured the shop runs normally, `/api/track`
answers 202 and `/tracker` says which of the three setup problems it is instead
of showing empty charts.

Nothing is created automatically — not at install, not at first boot: DDL at boot
races across instances and needs production privileges the app account usually
does not have. Point the `TRACKING_DB_*` variables in `.env` at a database (see
`.env.example` for the URL / socket / TLS forms), then:

```bash
npm run tracking:init              # create the schema
npm run tracking:init -- --dry-run # report what it would do, change nothing
```

Safe to run repeatedly, so it belongs in a deploy pipeline. It detects the engine
and generates matching DDL — **MariaDB 10+, MySQL 5.6+, MySQL 8 and Cloud SQL**
all work from the one command. Where there is no native JSON type `props` becomes
`LONGTEXT`; where partitioning is disabled the table is created unpartitioned,
which costs only the `DROP PARTITION` retention shortcut.

MySQL DDL does not roll back, so the installer is **resumable** rather than
transactional: every statement is `IF NOT EXISTS` and each completed migration is
recorded in a `schema_migrations` ledger. Fix the problem, run it again, and it
continues from where it stopped. If it cannot finish — most often because the
account may not create databases, which is normal on Cloud SQL — it writes
`tracking-schema.sql` and prints the grants the account actually holds. You can
ask for that file up front from a machine with no route to the database at all:

```bash
npm run tracking:init -- --print-sql
mysql -h <host> -u <user> -p < tracking-schema.sql
```

It writes the same ledger rows the installer would, so a later `tracking:init`
**adopts** the result rather than repeating it.

### Two things worth knowing before reading a report

- **`value` is EX-VAT, with `tax` reported separately.** This SDK inverts the
  usual naming — `gross` excludes VAT and `net` includes it — so the ex-VAT
  figure is `total.gross` / `totalGross`. Matches the WordPress plugin.
- **Cart quantity edits report the delta**, not the resulting line quantity:
  raising a line 2 → 5 is `add_to_cart` with quantity 3.

### GA4 / Google Tag Manager

Off by default. With `NUXT_PUBLIC_USE_GA4=false` no script loads and no
`dataLayer` is created.

```ini
NUXT_PUBLIC_USE_GA4=false   # master switch
NUXT_PUBLIC_GA4_KEY=        # G-XXXXXXXXXX — required when USE_GA4 is true
NUXT_PUBLIC_GTM_KEY=        # GTM-XXXXXXX — optional, and it CHANGES THE TRANSPORT
```

Keep these as **strings** in `nuxt.config.ts`, compared to `'true'`. Nuxt's
`NUXT_*` override only coerces when the default's type matches, so a real boolean
default changes behaviour between `nuxt dev` and `node .output/server` — the same
trap `paymentProvider` and `mollieTestMode` already work around.

**The two transports are not interchangeable.** With `NUXT_PUBLIC_GTM_KEY` set we push
`{event, ecommerce}` objects, which is what a container understands; without one
we call `gtag('event', …)`, which is the only thing gtag.js understands. Sending
the wrong one fails silently.

**With a container, events only reach GA4 once a tag exists for them in GTM.**
The property will otherwise show just Google's own automatic events while the
storefront is pushing correctly. Build tags for the names in
`app/lib/tracking/taxonomy.ts` — the GA4 names are those, with `propeller.`
rewritten to `propeller_` (a dot is illegal in a GA4 event name).

Verify with `npm run test:tracking`.

### `/tracker` is ungated

**Gate it before deploying anywhere shared.** It exposes every account's
behaviour and revenue to anyone with the URL. It is `noindex` and wrapped in
`<ClientOnly>`, which is not access control. Deliberately not behind the `auth`
middleware either — that would let any logged-in *customer* read it.

### Changing the schema

`server/utils/trackingSchema.ts` is the single source of truth. Migrations are
append-only: an id that has shipped is frozen, because installs in the field have
recorded it. Change an existing table with a new entry, never by editing an old
one — the ledger stores a checksum per migration and warns when one was applied
from different SQL than is now shipped.

Unlike propeller-vue — whose `server.js` bypasses Vite and therefore needs a
plain-JS duplicate of the event allowlist — Nitro compiles server code with the
same TypeScript pipeline, so `server/api/track.post.ts` imports the taxonomy from
`app/lib/` directly. One list, no drift risk.

Two Nitro-specific traps are worth remembering when adding to the server half:

- **`server/utils/**` is auto-imported recursively.** Every export there becomes
  a global identifier, which is why the modules are named `tracking*` and the
  metric registry is `TRACKER_METRICS` rather than `METRICS`. A collision is a
  runtime "not a function" in an unrelated file, with no compile-time signal.
- **`mysql2` is CommonJS with dynamic requires.** Fine on the default
  `node-server` preset; it breaks under any bundling preset.

## PunchOut (OCI + cXML)

B2B e-procurement PunchOut, built on magic-token login and powered by
[`@propeller-commerce/propeller-v2-punchout`](https://www.npmjs.com/package/@propeller-commerce/propeller-v2-punchout)
(the pure protocol logic). A buyer punches out from their ERP (SAP Ariba, Coupa,
SAP OCI), shops in a live session, and transfers the cart back as a requisition.

**Wiring (Nitro routes that call the package):**

| Concern | File |
|---|---|
| cXML `PunchOutSetupRequest` | `server/api/punchout/cxml/setup.post.ts` |
| Entry → session cookie → magic-login | `server/api/punchout/enter.get.ts` |
| Cart transfer | `server/api/punchout/transfer.post.ts` |
| Server glue + **field-mapping overrides** | `server/utils/punchout.ts` |
| Cart-page transfer button | `app/pages/cart.vue` |

**How it works**

- **cXML**: the buyer's system POSTs a `PunchOutSetupRequest` to
  `/api/punchout/cxml/setup`. The route reads the candidate contacts from
  `CXML_CONTACT_ID`, compares each one's `CXML_SHARED_SECRET` contact track
  attribute to the request's shared secret, mints a **one-time, 1-hour** magic
  token with the order-editor key, and returns a `PunchOutSetupResponse` whose
  StartPage is `/api/punchout/enter`.
- **OCI**: no handshake — the ERP opens
  `/api/punchout/enter?mode=oci&mtoken=…&HOOK_URL=…` directly.
- `enter` stores an httpOnly `punchout` cookie (survives magic-login's session
  clear) and redirects to `/magic-login`. The cart page then shows **Transfer
  cart to procurement** → `/api/punchout/transfer`, which builds the OCI
  `NEW_ITEM-*` set / cXML `PunchOutOrderMessage` and hands it back to the ERP.

**Configuring the output fields** — override any field in
`PUNCHOUT_MAPPINGS.ociMapping` / `cxmlMapping` in `server/utils/punchout.ts`
(deep-merged over the package defaults; `null` drops a field). See the package
README for the rule shape.

**Local testing** — set `PUNCHOUT_ENABLED=true`, `CXML_CONTACT_ID=<id>`,
`PUNCHOUT_DEBUG=true`, then POST the setup request (`curl -X POST
http://localhost:5000/api/punchout/cxml/setup -H 'Content-Type: application/xml'
--data-binary @SetupRequest.xml`) and open the returned StartPage URL, or open
`/api/punchout/enter?mode=oci&mtoken=…&HOOK_URL=…` for OCI. In debug mode the
transfer renders a readable preview and keeps the cart re-runnable; the magic
token is one-time, so re-POST the setup for a fresh StartPage.

## License

Private — Propeller Commerce.
