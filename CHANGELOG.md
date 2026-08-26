# Changelog

All notable changes to the propeller-nuxt boilerplate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.11.0] - 2026-08-26

### Fixed

- **The configured default language was ignored.** `app/utils/config.ts` read
  `process.env.NUXT_PUBLIC_DEFAULT_LANGUAGE`, a variable nothing in the scaffold
  ever set and which is undefined in the browser bundle anyway — so
  `DEFAULT_LANGUAGE` was always `NL` and a shop scaffolded `--default-locale=en`
  served Dutch at `/` with English pushed behind `/en`, exactly inverted.
  `nuxt.config.ts` resolves it from `BOILERPLATE_DEFAULT_LANGUAGE` (the variable
  the scaffolder writes) and inlines it, because the helpers that consume it run
  at module scope and cannot call `useRuntimeConfig()`.
- **The UI language was inferred from the currency.** The language store picked
  `runtimeConfig.public.currencyCode === 'EUR' ? 'NL' : 'EN'`, never consulting
  the configured default — a euro shop set to English still opened in Dutch. It
  reads `public.defaultLanguage` now.
- **`SUPPORTED_LANGUAGES` was hardcoded `['NL','EN']`,** so a shop scaffolded
  with other locales still prefixed exactly those two: a locale it shipped got
  no prefix, and one it didn't got one. Derived from `BOILERPLATE_LOCALES`.

## [1.10.0] - 2026-08-21

### Added

- **The last five reachable taxonomy events are wired — 46 of 47.**
  Needs `propeller-v2-vue-ui` 0.17.0, whose after-hooks now report what
  changed. `propeller.favorite_added` had never been emitted by any of the
  three storefronts: the toggle callback fired identically for an add and a
  removal, so GA4 `add_to_wishlist` and the dashboard's favourites panel read
  zero. `propeller.favorite_list_created` / `_updated` / `_deleted` and
  `propeller.quick_order_template_downloaded` were unwired for the same
  reason. Only `propeller.quote_rejected` is left, and no reject UI exists to
  hook. The two shared helpers land in `app/lib/tracking/events.ts`, which
  stays byte-identical to propeller-vue's copy.

### Fixed

- **The set-default address event was thrown away.**
  `account/addresses.vue` emitted `propeller.address_default_changed`, a name
  the taxonomy does not contain, and the ingest discards unrecognised names
  without an error — so the metric read zero since tracking shipped. The
  correct name is `propeller.address_set_default`, which propeller-next emits.
- **Unknown event names now fail to compile.** `app/lib/tracking/bus.ts` took
  `name: string`, which erased the taxonomy check for every call site behind
  the facade — that is why the typo above survived review and `nuxt typecheck`.
  It takes `EventName` now. The shared `tracker.ts` core keeps `string`: it is
  byte-identical across the three storefronts, so the facade is the right seam.
- **`npm run clean` was broken on every platform.** The PowerShell
  one-liner had an unterminated quote, so it failed even on Windows, and it was
  Windows-only besides. propeller-next and propeller-vue were fixed when the
  finding came in; nuxt was missed. Now the same portable node one-liner,
  extended to `.output`.

## [1.9.0] - 2026-08-21

### Added

- **Behaviour tracking, GA4/GTM and a `/tracker` dashboard.** The
  storefront emits its own event vocabulary on a subscribe-based bus
  (`app/lib/tracking/`); two subscribers read that one stream — a batching POST
  to `/api/track` that writes MySQL, and a GA4 mapper. A tenant who wants Segment
  or Snowplow instead writes a third mapper and nothing else changes. This ports
  propeller-next 1.14.0 event-for-event, so reports are comparable across all
  three storefronts: 41 of the 47 taxonomy names are wired, covering identity,
  auth, navigation, catalog, cart, checkout, purchase, the B2B surfaces and the
  account long tail.

  The core (`types`, `taxonomy`, `tracker`, `batch`, `items`) is framework-free
  and copied verbatim from propeller-next so future syncs stay a plain diff;
  `bus.ts` is the only file that knows about the framework, and its
  `import.meta.client` guard is what keeps `tracker.ts`'s pre-context buffer
  unreachable on Nitro — on the server no context ever lands and nothing drains
  it, which in a long-lived process is unbounded growth and a cross-request leak.
  It lives in `app/lib/`, not `app/utils/`, because `app/utils/**` is
  auto-imported recursively and exporting `track` or `reset` from there would
  make them global identifiers.

- **`npm run tracking:init` — the analytics schema installer.** Nothing is
  created automatically, not at install and not at first boot: DDL at boot races
  across instances and needs privileges the app account usually does not have.
  One command detects the engine and emits matching DDL for **MariaDB 10+,
  MySQL 5.6+, MySQL 8 and Cloud SQL**; `--dry-run` reports without writing and
  `--print-sql` emits the whole schema for a DBA to run by hand. Because MySQL
  DDL cannot roll back it is resumable rather than transactional: every statement
  is `IF NOT EXISTS` and each completed migration is recorded in a
  `schema_migrations` ledger, so a hand-run script is *adopted* by a later
  `tracking:init` rather than repeated.

- **`/tracker` — nine dashboard sections** over a 13-metric API, with no charting
  dependency: only the trend line is a real chart and it is a hand-rolled
  `<polyline>`. `/api/tracker` classifies driver errors into `not_configured` /
  `unreachable` / `schema_missing` / `access_denied` / `tls` and answers **503
  with the fix attached**, so an unconfigured shop says which of the three setup
  problems it is instead of showing nine empty panels. The page is wrapped in
  `<ClientOnly>` — server-rendering it would self-`fetch` with the wrong base URL
  and no cookies, and hit the database during render.

  **It is ungated by request — gate it before deploying anywhere shared.** It
  exposes every account's behaviour and revenue to anyone with the URL.

- **`/quick-order`**, which this storefront did not have: the vue-ui
  `QuickOrder` component behind the auth middleware, `xlsx` parsing of an
  uploaded order file, a downloadable template and EN/NL locales — plus its two
  tracking events.

### Fixed

- **Header logins emitted no `login` event.** `<LoginForm>` authenticates itself
  and hands the user back through an `afterLogin` callback, so every surface that
  renders one runs its own post-login sequence, and `AppHeader.handleAfterLogin`
  is a full duplicate of `useAfterLogin` that never calls it. Attaching the event
  to the composable covered `/login` and `/magic-login` and silently missed the
  header — the most common way to sign in. There is now one `trackLogin()` in
  `app/lib/tracking/bootstrap.ts` that every sink calls.

- **`setSelectedCompany` reported a company switch on every B2B login** and
  stamped the *previous* company on everything that followed it: it republished
  the tracking context before assigning the new company, and its guard was
  missing the `previousId != null` half. Both now match propeller-next.

## [1.8.7] - 2026-08-20

### Added

- **The channel's anonymous user is handed to the client.** A new
  `/api/catalog/channel-defaults` route exposes it (the channel query needs the
  api key, so only the server can resolve it), the propeller plugin fetches it
  once during SSR and carries it to the browser in the Nuxt payload, and it is
  exposed on the package `configuration`. Anonymous SSR and the client refetch
  now scope catalog queries identically; previously the client asked an
  unscoped question and quietly replaced a correctly-scoped product list with a
  different one.

### Fixed

- **A bad endpoint or api key was reported as a channel-config problem, and
  memoised.** `getChannelDefaults` swallowed every failure into
  `{}`, so a DNS failure, a 401 and "this channel has no catalogRootId" were
  indistinguishable downstream — and the empty result was cached for the full
  TTL. It now throws with context, and the memo is never written on the failure
  path, so the next request retries.

## [1.8.6] - 2026-08-12

### Fixed

- **Product, cluster and autosuggest links used default-language slugs
.** vue-ui 0.15.0 resolves the slugs behind `OrderItemCard`'s item
  link and `SearchBar`'s result links by the active language. Names were
  already correct; the slugs were not, so every non-default locale emitted
  wrong-language URLs.
- **"Request authorization" in the cart sidebar did nothing.** `useCart` unwrapped the caller's cart id once at setup, so the
  header sidebar — created before the cart resolves — held an empty id for the
  life of the page and the request never left the browser.

### Changed

- The favorites list's add-product button now reads "Add product to favorite
  list" / "Voeg product toe aan favorietenlijst".

## [1.8.5] - 2026-08-11

### Fixed

- **Checkout step 3 opened with nothing selected on a fresh cart.**
  The payment-method and carrier grids only restored a value the cart already
  stored, so a first-time cart rendered both blank and Continue rejected the
  step until the user clicked. vue-ui 0.14.10 preselects the stored option when
  there is one and otherwise the first one offered. It also fixes "on account"
  never being hidden from guests, which would have won that preselection, and
  moves the upward notification off an `immediate` watch so it no longer fires
  during SSR.

## [1.8.4] - 2026-08-11

### Changed

- `@propeller-commerce/propeller-v2-vue-ui` -> `^0.14.8`, catching up with three
  package releases: overridable user-visible strings and modal close
  accessibility (0.14.6), `OrderBonusItems` showing the netted price of a free
  item rather than its list price (0.14.7), and quick order scoping its code
  search to the shop's catalogue (0.14.8).

  The 0.14.8 change makes `QuickOrder` depend on
  `configuration.baseCategoryId`. Nuxt has no quick-order page and sets
  `BASE_CATEGORY_ID` in its env, so nothing here needs rewiring — but see the
  note below before removing that variable.

### Known issues

- `AppHeader` renders the category menu only when `configuration.baseCategoryId`
  is defined, which is the `BASE_CATEGORY_ID` env override. A shop that leaves it
  unset — the channel-driven default everywhere else — gets no menu
  at all, even though `/api/catalog/menu` resolves the root server-side and
  returns a usable tree. Nuxt is the only stack that still needs the variable.

## [1.8.3] - 2026-08-10

### Fixed

- **Switching to a language with partial translations emptied the category
  menu**. `fetchMenu` filtered the localized fields server-side, so a
  category with no entry for that language came back with empty `names` /
  `slugs` and the mapper's fallback had nothing to fall back to — the row
  rendered with a blank label and an empty slug. Both fields are now fetched
  unfiltered and the mapper falls back to whichever translation exists.
- **The catalog root is now channel-driven, with no literals**.
  `config.baseCategoryId` and both `nuxt.config.ts` runtimeConfig entries
  defaulted to a hardcoded `17` — correct on one tenant, wrong on every other.
  All three are the env override only now; `resolveBaseCategoryId()` throws
  rather than guessing when neither the env nor the channel yields a root, and
  `/api/catalog/search` resolves it from the channel when unconfigured.

### Changed

- `@propeller-commerce/propeller-v2-vue-ui` → `^0.14.5`.

## [1.8.2] - 2026-08-10

### Fixed

- **Cart and checkout showed the same lines on different tax bases.** With the
  header toggle on "Incl. BTW", the cart printed a line incl. VAT that checkout
  printed excl. VAT, neither labelled. `ItemsOverview` ignored
  `includeTax` while `CartItem` on the cart page followed it. Fixed in
  `propeller-v2-vue-ui` 0.14.4; both components now read the same
  `totalSum` / `totalSumNet` fields. No host change needed — `app.vue` already
  binds `:include-tax` on the provider.

### Changed

- `@propeller-commerce/propeller-v2-vue-ui` → `^0.14.4`.

## [1.8.1] - 2026-08-10

### Fixed

- **The order summary's total did not match its own lines, and ignored the
  payment method.** Two defects, both visible on the cart page and in the
  checkout sidebar:
  - The payment method's transaction costs are part of `total.totalGross` but
    had no line of their own, so a €7.25 order with €49.00 shipping printed a
    "Total excl. VAT" of €56.60. Fixed in `propeller-v2-vue-ui` 0.14.3, which
    renders a **Transaction costs** row; `app/locales/{en,nl}/CartSummary.json`
    gain the matching `transactionCosts` label.
  - Selecting a payment method at step 3 only set a local ref, so the totals
    kept showing the *previously stored* method's costs and then jumped when
    step 4 loaded. `app/pages/checkout/index.vue` now persists the method on
    select (skipping the no-op when the cart already carries it).

### Changed

- `@propeller-commerce/propeller-v2-vue-ui` → `^0.14.3`.

## [1.8.0] - 2026-08-04

### Added
- Anonymous user id is now derived from the channel at runtime instead of a
  hardcoded config value. `server/utils/fetchers.ts` reads `channel(channelId)`
  once (cached) and uses its `anonymousUserId` for anonymous catalog/search
  price queries — so guest pricing follows the channel's configured account
  rather than the backend apikey default — and its `catalogRootId` as the
  base-category fallback when the base category env is unset.

### Changed
- Bumped `@propeller-commerce/propeller-sdk-v2` to `^0.16.0` (additive over
  0.14: the 0.15 inventory stock filter and 0.16 grid attributes; no migration).
- Bumped `@propeller-commerce/propeller-v2-vue-ui` to `^0.13.0` (from 0.8.0),
  which pulls in `propeller-v2-core-ui` 0.6.1 — the version carrying the ENUM
  configurator fix below. Typecheck + Nitro build verified clean across the
  boilerplate's vue-ui usage.

### Fixed
- Cluster configurator now renders options for ENUM-spanned clusters (an empty
  option list previously blocked variant selection). The shared attribute
  extractor read `value` for `AttributeEnumValue`, but the schema exposes those
  on `enumValues`. Arrives via the `propeller-v2-vue-ui` 0.13.0 /
  `propeller-v2-core-ui` 0.6.1 update.

## [1.7.0] - 2026-07-30

### Added
- OCI + cXML PunchOut (B2B e-procurement), built on magic-token login and the
  `@propeller-commerce/propeller-v2-punchout` package. Nitro `server/api/punchout/*`
  routes handle the cXML `PunchOutSetupRequest`, the OCI/cXML session entry, and
  the cart transfer back to the ERP. Field mappings are config-driven; the cXML
  shared secret is validated against the buyer contact's `CXML_SHARED_SECRET`
  track attribute.

## [1.6.0] - 2026-07-29

### Added
- Magic-token (passwordless) login: `/magic-login?mtoken=` exchanges a
  backend/ERP-issued token for a session. Bumps `propeller-v2-vue-ui` to 0.8.0.

## [1.5.0] - 2026-07-29

### Changed
- Aligned with propeller-sdk-v2 0.14.0 (deprecated-surface removal). Bumps
  `propeller-v2-vue-ui` to 0.7.0.

## [1.4.0] - 2026-07-24

### Added
- CMS integration mirroring the Next / Vue boilerplates' provider model.

## [1.3.0] - 2026-07-23

### Added
- Spare-parts machines section: a contact-only browser over the company's
  installed machines. Bumps `propeller-v2-vue-ui` to 0.4.0.

## [1.2.0] - 2026-07-08

### Changed
- Bumped propeller-sdk-v2 to 0.12.0 and `propeller-v2-vue-ui` / mollie to match.

## [1.1.0] - 2026-06-29

### Added
- Mollie PSP payments (`@propeller-commerce/propeller-v2-mollie`): hosted
  payment page, webhook + return handling, order status resolved from the
  authoritative backend order.

### Fixed
- Resolve Pinia stores via `usePinia()` in plugins (getActivePinia crash fix).
- Route order-editor operations to the order-editor key in the GraphQL proxy.

## [1.0.0] - 2026-06-10

First public release of the Nuxt 3 SSR boilerplate.

### Added
- Nuxt 3 SSR shop mirroring propeller-next's cache / tag / revalidate semantics.
- Consumes the published Propeller Vue UI package and SDK.
- Public GitHub mirror with CI-driven releases.
