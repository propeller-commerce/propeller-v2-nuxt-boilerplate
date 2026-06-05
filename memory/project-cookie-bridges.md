---
name: project-cookie-bridges
description: selected_company_id and price_include_tax cookies are the SSR-read source of truth
metadata:
  type: project
---

**Fact**: Three cookies bridge client-side Pinia state to server-side SDK
fetches:

| Cookie | httpOnly? | Set by | Read by |
|---|---|---|---|
| `access_token` | yes | `/api/auth/session.post.ts` after login | `server/utils/infra.ts:getServerInfra` |
| `selected_company_id` | no | `company.setSelectedCompany()` in store | `server/utils/infra.ts:readSelectedCompanyId` |
| `price_include_tax` | no | `price.setIncludeTax()` in store | `server/utils/infra.ts:readIncludeTax` |

`access_token` (httpOnly) gives the auth cookie maximum protection — the
client SDK never reads it. The other two are plain cookies because the
non-SSR client SDK also reads them (the price toggle and company selection
need to round-trip without a server hop).

**Why**:
- Without `selected_company_id`, the server seeds the page from the user's
  default company while the client uses the picked one — silent
  desynchronisation of prices, assortment, filter facets.
- Without `price_include_tax`, the SSR render always shows net prices and
  the page flickers to gross on hydration for users with the toggle on.
- httpOnly on `access_token` defends against XSS; the two non-httpOnly
  cookies are safe to expose (just user preferences, no auth).

**How to apply**:
- Store ↔ cookie sync goes through the store action. `company.setSelectedCompany(c)` writes the cookie via `writeCompanyCookie`. Direct
  `document.cookie = ...` writes outside the store break the SSR seam.
- Clearing on logout: `auth.logout()` calls `deleteBrowserCookie('access_token')` AND hits
  `DELETE /api/auth/session` to clear the httpOnly cookie. Without the
  server hit, the next SSR would still see the cookie.
- Adding a new cookie bridge? Mirror the pattern in the price/company
  stores — non-httpOnly, `SameSite=Lax`, max-age sized to the preference
  lifetime. Add the server-side read to `server/utils/infra.ts`.

Related: [[project-pinia-stores]], [[project-anonymous-ssr-caching]].
