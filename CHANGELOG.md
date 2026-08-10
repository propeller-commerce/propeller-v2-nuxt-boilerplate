# Changelog

All notable changes to the propeller-nuxt boilerplate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
