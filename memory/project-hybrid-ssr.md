---
name: project-hybrid-ssr
description: Hybrid SSR shape — pages call /api/catalog endpoints, package grid wraps in ClientOnly
metadata:
  type: project
---

**Fact**: Catalog pages render server-side via Nitro endpoints (not by
dynamic-importing server utils into Vue pages). Pages call
`useFetch('/api/catalog/{category,product,cluster,search,menu}')` and the
endpoints wrap the SDK call with `cachedSdkFetch`.

**Why**:
- Pages running in Vite's app context can't reliably import
  `~~/server/utils/*` — Nitro's auto-imports (`useStorage`,
  `useRuntimeConfig`, `getCookie`) only resolve inside files Nitro builds.
  Dynamic-importing them from app/ crosses that boundary and breaks.
- `useFetch` to a same-process Nitro endpoint has effectively zero overhead
  in SSR — Nitro short-circuits the HTTP roundtrip. So routing data
  through `/api/catalog/*` is cleaner without a real performance cost.
- The package's `<ProductGrid>` / `<GridFilters>` / `<GridToolbar>` weren't
  written for server-render — they reach for `.length` on undefined props
  during the server pass. Wrapping them in `<ClientOnly>` is the
  pragmatic shape: server renders title + breadcrumb shell with seeded
  data; grid hydrates client-side with the same payload via Nuxt's
  `__NUXT__` payload, no second fetch.

**How to apply**:
- New catalog data endpoint? Add it under `server/api/catalog/` as a
  `.get.ts` file. The handler must call `getListingInfra(event)` and pass
  through to a `server/utils/fetchers.ts` helper so the cache+tag scheme
  is applied uniformly.
- New SSR page that needs catalog data? Use `useFetch('/api/catalog/X', { query, key, watch })`. The key must include language + any
  per-call inputs (page, offset, sort, filter slice) so navigations and
  language switches re-fetch correctly.
- Need an interactive grid/filter component? Wrap in `<ClientOnly>` with a
  skeleton `<template #fallback>` block to keep the SSR shape stable.
- Need server-only data (no client fetch)? `useAsyncData` works too, but
  prefer endpoints — they're testable in isolation and document the data
  contract.

Related: [[project-server-seam-imports]], [[project-anonymous-ssr-caching]], [[project-clientonly-grid]].
