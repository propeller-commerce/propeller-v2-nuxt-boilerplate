---
name: project-clientonly-grid
description: ProductGrid / GridFilters / GridToolbar wrap in ClientOnly — package not SSR-safe
metadata:
  type: project
---

**Fact**: Catalog page templates wrap the package's interactive grid
components in `<ClientOnly>` with a skeleton `<template #fallback>`:

```vue
<ClientOnly>
  <div class="flex flex-col lg:flex-row gap-8">
    <aside class="w-full lg:w-64 flex-shrink-0">
      <GridFilters :collapsed="true" />
    </aside>
    <div class="flex-1 w-full min-w-0">
      <GridToolbar :items-found="((category as any)?.products?.itemsFound) ?? 0" />
      <ProductGrid :products="(category as any)?.products" ... />
    </div>
  </div>

  <template #fallback>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="aspect-square animate-pulse rounded-lg bg-muted" />
    </div>
  </template>
</ClientOnly>
```

**Why**: `propeller-v2-vue-ui`'s `<ProductGrid>` (and friends) wasn't
designed for SSR-only render. Server-rendering them throws
`Cannot read properties of undefined (reading 'length')` because the
component reads internal state during the server pass that only resolves
after `<PropellerProvider>` reactivity ticks on the client. This is a
package-side concern — fixing it means retrofitting the components to be
SSR-safe (probably worth it long-term, but not blocking).

The SSR pre-render still does useful work: the page-level `useFetch` to
`/api/catalog/category` runs server-side, caches with tags, fills
`__NUXT__` payload. The grid hydrates instantly with that payload — no
client refetch — but the *rendering* happens after hydration.

**How to apply**:
- Any catalog component from the package that uses `useInfraProps` or
  reads from `<PropellerProvider>` reactively — wrap in `<ClientOnly>`.
- Page title, breadcrumbs, h1, JSON-LD — these are render-safe and stay
  outside the `<ClientOnly>` so they SSR.
- Skeletons in `<template #fallback>` keep CLS reasonable during the
  hydration moment.
- If the package later gets SSR-safe components (the plan mentions
  retrofitting `useInfraProps`), drop the `<ClientOnly>` wrappers.

**Layout safety net** (2026-06-05 addendum): the `<aside>` carries
`lg:w-64 flex-shrink-0` for the row layout. Tailwind v4 emits `lg:w-64`
as a nested `@media` rule, but if the Tailwind sources hook isn't
configured the class never enters the bundle and the aside stretches
full-width, squeezing the products column to zero. We added an explicit
`.propeller-catalog-grid { flex-direction: row }` /
`.propeller-catalog-aside { width: 16rem; flex: 0 0 16rem }` rule pair
in `app/assets/css/app.css` keyed on the same marker classes, gated by
`@media (min-width: 1024px)`. Belt-and-suspenders against future tooling
regressions. See [[project-tailwind-v4-sources-hook]].

Related: [[project-package-consumption]], [[project-hybrid-ssr]],
[[project-tailwind-v4-sources-hook]].
