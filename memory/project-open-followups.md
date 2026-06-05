---
name: project-open-followups
description: Outstanding work from initial bootstrap (2026-06-05) — not blocking but worth doing
metadata:
  type: project
---

**Fact**: The 2026-06-05 bootstrap deliberately left these items as
follow-up. None block dev or staging smoke tests; all are real product
quality improvements.

1. **Copy package-namespace translation dictionaries.**
   `app/composables/useTranslations.ts` is a stub returning `{}` per
   namespace, which makes the package's components fall back to their
   English defaults. Real namespace dictionaries
   (`{Component}.{lang}.json`) live in
   `D:/laragon/www/propeller-vue/src/locales/{en,nl}/`. Copy the
   directory + the `_registry.ts` aggregator, point `useTranslations`
   at the registry. ~50 JSON files plus the registry.

2. **Migrate propeller-vue view bodies into the Nuxt pages.**
   The pages currently exercise the package's primitives with a thin
   shell. The richer behaviour (toolbar wiring, filter state, view-mode
   toggle, mobile drawer, JSON-LD blocks) lives verbatim in
   `propeller-vue/src/views/CategoryView.vue` etc. Port view bodies
   inside the `<ClientOnly>` wrappers. Plan section "Catalog page shape"
   in `C:/Users/ThinkBook/.claude/plans/shiny-puzzling-raccoon.md`.

3. **Production cache driver.**
   Dev uses the in-memory driver; multi-instance prod needs Redis. Add
   the storage map under `nitro.storage` (top-level, not `devStorage`)
   guarded by `NODE_ENV === 'production'` and `REDIS_URL`. The
   `cachedSdkFetch` wrapper is driver-agnostic, no code change required.
   See [[feedback-cache-driver-memory-only-dev]].

4. **Refresh-token rotation in `/api/graphql` proxy.**
   The current proxy injects the API key but doesn't rotate refresh
   tokens. Port the logic from propeller-next's
   `app/api/graphql/route.ts` so client mutations survive token
   rotation under load.

5. **Retrofit package components for SSR.**
   The `<ClientOnly>` wrap around `ProductGrid` / `GridFilters` /
   `GridToolbar` is a workaround for the components reading `.length`
   on undefined props during the server pass. Long-term fix is to make
   the components SSR-safe by guarding internal state reads. Lives in
   the package repo, not here. See [[project-clientonly-grid]].

6. **JSON-LD blocks (SEO).**
   Pages currently emit `<title>` via `useHead` only. The Vue UI package
   has `ItemListJsonLd`, `ProductJsonLd`, `ClusterJsonLd` components.
   Wire them into catalog pages once the package SSR retrofit lands
   (item 5).

7. **Auto-import lockdown.**
   The duplicate-import warning from the deleted `stores/index.ts` is
   resolved. Worth checking that `composables/` and `utils/` exports
   stay clean as new files land — Nuxt warns if a name is double-defined.

**How to apply**:
- Picking one up? Move it from this note to an active task; the note
  documents the rationale so a future-me knows why each was deferred.
- Adding a new follow-up? Append here with a one-line "why" and a
  pointer to where the code change goes.

Related: [[project-verification]], [[project-package-consumption]].
