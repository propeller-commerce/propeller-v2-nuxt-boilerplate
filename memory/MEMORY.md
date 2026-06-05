# Project Memory — propeller-nuxt

Loaded into every Claude session for this project. Read this index first;
follow `[[links]]` only when relevant.

## Architecture (READ THIS FIRST)
- [Architecture overview](project-architecture.md) — three-consumer matrix, two-tier DI, who owns what
- [Hybrid SSR shape](project-hybrid-ssr.md) — pages → /api/catalog endpoints → cached SDK
- [Anonymous SSR caching](project-anonymous-ssr-caching.md) — tag scheme, TTL, revalidate contract
- [Server seam imports gotcha](project-server-seam-imports.md) — explicit h3 / nitropack imports

## Key paths
- App code: `app/` — pages, layouts, components, plugins, middleware, stores, composables, utils
- Server code: `server/` — utils (tags/cache/infra/fetchers) + api endpoints
- i18n: `i18n/locales/{nl,en}.json` (app-level) + package's `useTranslations` for component labels
- Config: `nuxt.config.ts` (module + runtime config), `app/utils/config.ts` (image profiles, URL builders), `.env` (server-only secrets + public exposed)

## Rules and patterns
- [Three-consumer mirror rule](feedback-three-consumer-mirror.md) — backend/cache contract changes affect all three apps
- [No Mitosis / no codegen](project-no-codegen.md) — hand-maintained Vue, same posture as the other consumers
- [Package consumption](project-package-consumption.md) — `propeller-v2-vue-ui` via github: pin, build.transpile required
- [ClientOnly around the grid](project-clientonly-grid.md) — why ProductGrid / GridFilters / GridToolbar wrap in `<ClientOnly>`
- [Pinia stores mirror propeller-vue](project-pinia-stores.md) — auth/cart/company/language/menu/price/ssrCatalog shape
- [Cookie bridges](project-cookie-bridges.md) — selected_company_id + price_include_tax are the SSR-read source of truth
- [Routes inventory](project-routes-inventory.md) — full route map and how each maps to a propeller-next equivalent
- [Search canonical = query-style](project-search-canonical-query-style.md) — handleSearch navigates to /search?q=term directly; /search/term is alias-only
- [JsonLd context shape](project-jsonld-context-shape.md) — exact { siteUrl, language, currencyCode, portalMode, user, urls } shape required by ItemListJsonLd / ProductJsonLd / ClusterJsonLd
- [VAT display-only / company refetches](project-vat-display-only-company-refetches.md) — company in useFetch key+watch; includeTax stays a pure prop on price components
- [Tailwind v4 sources hook](project-tailwind-v4-sources-hook.md) — `hooks.tailwindcss:sources:extend` adds the package dist so its utility classes compile

## Environment
- [Env vars + staging endpoint](project-env-vars.md) — server-only vs NUXT_PUBLIC_*, BASE_CATEGORY_ID=1324, REVALIDATE_SECRET

## Verified behaviour (2026-06-05 smoke test)
- [Verification results](project-verification.md) — what was tested end-to-end against staging and what passed

## Known gotchas
- [Dev server lock + Windows kill](feedback-dev-server-lock-windows.md) — NUXT_IGNORE_LOCK / PowerShell Stop-Process
- [Cache fs driver chokes on `:`](feedback-cache-driver-memory-only-dev.md) — keep dev on memory driver, prod uses Redis
- [#app-manifest pre-transform warning](feedback-app-manifest-warning-harmless.md) — known Nuxt 3.14 noise, ignore
- [itemsFound not totalProducts](feedback-itemsfound-not-totalproducts.md) — staging response uses `itemsFound`
- [No double refresh](feedback-no-double-refresh.md) — never call refreshNuxtData() alongside per-page useFetch watchers; they race and AbortController cancels the in-flight request

## Outstanding
- [Open follow-ups](project-open-followups.md) — package-namespace dictionaries copy, full propeller-vue view bodies migration, prod Redis driver
