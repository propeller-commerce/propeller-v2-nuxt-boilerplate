---
name: project-verification
description: End-to-end smoke test run 2026-06-05 against staging — what passed
metadata:
  type: project
---

**Fact**: Verified end-to-end against `https://api.staging.helice.cloud/v2/graphql`
on 2026-06-05 after initial bootstrap. All checks passed.

| Check | Method | Result |
|---|---|---|
| Dev server boot | `npm run dev` | http://localhost:3000 200 |
| Home SSR | `curl /` | 200, HTML with header/footer/main rendered, store seeded NL |
| Menu cache | `curl /api/catalog/menu` | Returns real Quantore facilitair tree (Eten en drinken → Koekjes, Chocolade…) |
| Category page | `curl /category/1324/quantore` | 200 (after `<ClientOnly>` wrapper around grid) |
| Search page | `curl /search?q=test` | 200 |
| Product page | `curl /product/109611/test` | 200 |
| CSR shadow | `curl /csr/category/1324/test` | 200 (SPA shell) |
| Login page | `curl /login` | 200 |
| Cart page | `curl /cart` | 200 |
| Auth redirect | `curl -I /account` | 302 → /login?redirect=/account |
| Revalidate (no secret) | `POST /api/revalidate` | 401 |
| Revalidate (with secret) | `POST /api/revalidate {tag:'menu'}` | `{ok:true, tag:'menu', cleared:1}` |
| Revalidate (wildcard) | `POST /api/revalidate {tag:'*'}` | `{ok:true, tag:'*', cleared:1}` (rewrites to TAG_CATALOG) |

**Why** (each check exists to validate one wire-level contract):
- Menu: validates the cached SDK fetch path + the `tagFor('menu')` index.
- Catalog pages: validate `useFetch('/api/catalog/*')` SSR seeding +
  `<ClientOnly>` wrap.
- Auth redirect: validates server-cookie-aware middleware reading
  `getCookie(event, 'access_token')` server-side.
- Revalidate: validates the webhook contract (same as propeller-next's
  byte-identical contract).

**How to apply**:
- Smoke-testing again after a change? Run these same curls. If any of the
  cached endpoints respond 500, check `useStorage`/`getCookie` imports
  (see [[project-server-seam-imports]]).
- New page added? Add a curl line for it in the next smoke session.
- Reproducing locally? Boot needs the `.env` to point at a real backend.
  Staging is the default.

Related: [[project-anonymous-ssr-caching]], [[project-server-seam-imports]], [[project-routes-inventory]].
