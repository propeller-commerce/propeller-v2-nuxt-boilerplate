# Changelog

All notable changes to the propeller-nuxt boilerplate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.8.7] - 2026-08-20

### Added

- **The channel's anonymous user is handed to the client (PWP-942 #22).** A new
  `/api/catalog/channel-defaults` route exposes it (the channel query needs the
  api key, so only the server can resolve it), the propeller plugin fetches it
  once during SSR and carries it to the browser in the Nuxt payload, and it is
  exposed on the package `configuration`. Anonymous SSR and the client refetch
  now scope catalog queries identically; previously the client asked an
  unscoped question and quietly replaced a correctly-scoped product list with a
  different one.

### Fixed

- **A bad endpoint or api key was reported as a channel-config problem, and
  memoised (PWP-942 #9).** `getChannelDefaults` swallowed every failure into
  `{}`, so a DNS failure, a 401 and "this channel has no catalogRootId" were
  indistinguishable downstream — and the empty result was cached for the full
  TTL. It now throws with context, and the memo is never written on the failure
  path, so the next request retries.

## [1.8.6] - 2026-08-12

### Fixed

- **Product, cluster and autosuggest links used default-language slugs
  (PWP-940).** vue-ui 0.15.0 resolves the slugs behind `OrderItemCard`'s item
  link and `SearchBar`'s result links by the active language. Names were
  already correct; the slugs were not, so every non-default locale emitted
  wrong-language URLs.
- **"Request authorization" in the cart sidebar did nothing (PWP-937 /
  PWP-938).** `useCart` unwrapped the caller's cart id once at setup, so the
  header sidebar — created before the cart resolves — held an empty id for the
  life of the page and the request never left the browser.

### Changed

- The favorites list's add-product button now reads "Add product to favorite
  list" / "Voeg product toe aan favorietenlijst" (PWP-939).

## [1.8.5] - 2026-08-11

### Fixed

- **Checkout step 3 opened with nothing selected on a fresh cart (PWP-934).**
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
  unset — the channel-driven default everywhere else since PWP-913 — gets no menu
  at all, even though `/api/catalog/menu` resolves the root server-side and
  returns a usable tree. Nuxt is the only stack that still needs the variable.

## [1.8.3] - 2026-08-10

### Fixed

- **Switching to a language with partial translations emptied the category
  menu** (PWP-927). `fetchMenu` filtered the localized fields server-side, so a
  category with no entry for that language came back with empty `names` /
  `slugs` and the mapper's fallback had nothing to fall back to — the row
  rendered with a blank label and an empty slug. Both fields are now fetched
  unfiltered and the mapper falls back to whichever translation exists.
- **The catalog root is now channel-driven, with no literals** (PWP-913).
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
  printed excl. VAT, neither labelled (PWP-923). `ItemsOverview` ignored
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
  checkout sidebar (PWP-930):
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
