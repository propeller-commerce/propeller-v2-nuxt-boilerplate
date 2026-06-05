---
name: project-anonymous-ssr-caching
description: Cache-tag scheme, TTL, revalidate webhook contract — byte-identical to propeller-next
metadata:
  type: project
---

**Fact**: Anonymous catalog reads go through
`server/utils/cache.ts:cachedSdkFetch` backed by `useStorage('cache')` with
per-entity tags and a 300-second TTL. Authenticated requests skip the cache
entirely.

The webhook contract matches propeller-next 1:1 — the same backend service
can drive both apps:

```
POST /api/revalidate
Header: X-Revalidate-Secret: <REVALIDATE_SECRET>
Body:   { "tag": "product:42" | "category:13" | "menu" | "catalog" | "*" }
200    { ok: true, tag, cleared }
401    { error: "unauthorized" }
503    { error: "revalidation endpoint not configured" }
```

**Why**:
- `tagFor(entity, id?)` in `server/utils/tags.ts` is the single source of
  truth for tag shape. Never inline `'product:42'` literals.
- `TAG_CATALOG` is the umbrella tag every anonymous fetcher attaches —
  busting it clears every cache entry. `{"tag":"*"}` rewrites to
  `TAG_CATALOG` for safety.
- Nitro has no first-class tag invalidation, so the wrapper maintains a
  `tag:<tag>` → cacheKey[] inverted index in `useStorage('cache')` and
  walks it at bust time. Same eventual-consistency posture
  propeller-next's data cache has.

**How to apply**:
- Adding a cached SDK call? Wrap it in `cachedSdkFetch({ key, tags,
  bypass: !infra.cacheable, fetcher })`. Tags must use `tagFor`.
- The `bypass` flag is `!infra.cacheable` — `getServerInfra` returns
  `cacheable: false` because the cookie read opted the route into
  dynamic rendering; `getAnonymousInfra` returns `cacheable: true`;
  `getAnonymousInfraWithTax` returns `false` (it reads the
  `price_include_tax` cookie).
- `stableStringify` (in `cache.ts`) sorts object keys so the same SDK
  input always produces the same cache key regardless of object
  construction order. Use it when building cache keys from variables.
- TTL: `ANONYMOUS_CACHE_TTL_SECONDS = 300`. Match propeller-next.
- Driver: dev uses `memory` (set in `nuxt.config.ts:nitro.devStorage`).
  Production should map `cache` to Redis — the wrapper is driver-agnostic.

Related: [[project-hybrid-ssr]], [[feedback-cache-driver-memory-only-dev]], [[project-server-seam-imports]].
