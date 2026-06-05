---
name: feedback-three-consumer-mirror
description: Backend/cache contract changes affect propeller-next AND propeller-vue AND propeller-nuxt
metadata:
  type: feedback
---

**Rule**: any change that touches a cross-app contract MUST land in all
three consumers (or be explicitly waived for one). The contracts include:

- The cache-tag scheme (`tagFor`, `TAG_CATALOG`, TTL).
- The `/api/revalidate` webhook (header name, body shape, status codes).
- Auth cookie names (`access_token`, `refresh_token`,
  `selected_company_id`, `price_include_tax`).
- The `localizeHref`/language-URL strategy (NL unprefixed, EN at `/en/`).
- SDK input variable order in cache-keyed calls (so the cache key stays
  stable across consumers if they ever share a Redis backend).

**Why**: I'm one careless edit away from "works in propeller-next, fails
in propeller-nuxt because the cookie name silently changed." The
infrastructure savings of three identical consumers are real, but only
hold if I treat the contract as a multi-app invariant.

**How to apply**:
- Editing `server/utils/tags.ts`? Diff against
  `propeller-next/lib/server.ts` first — they MUST stay byte-identical
  in the `tagFor`, `TAG_CATALOG`, and `ANONYMOUS_CACHE_TTL_SECONDS`
  exports.
- Editing the revalidate endpoint? Same check — propeller-next's
  `app/api/revalidate/route.ts` is the canonical reference. If one
  changes, both change.
- Adding a cookie? Document it in [[project-cookie-bridges]] AND mirror
  the same name + behaviour in propeller-next + propeller-vue.
- Updating the SDK or the Vue UI package version? Check the
  corresponding bump on the other consumers — divergent versions break
  silent assumptions.

Related: [[project-anonymous-ssr-caching]], [[project-cookie-bridges]], [[project-architecture]].
