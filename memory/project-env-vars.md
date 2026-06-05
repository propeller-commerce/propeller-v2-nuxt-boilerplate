---
name: project-env-vars
description: Env vars + staging endpoint + REVALIDATE_SECRET shared with propeller-next + propeller-vue
metadata:
  type: project
---

**Fact**: `.env` mirrors the staging values from propeller-next +
propeller-vue. The same `BOILERPLATE_API_KEY` and same `REVALIDATE_SECRET`
work across all three apps.

```
# Server-only (never sent to client)
BOILERPLATE_GRAPHQL_ENDPOINT=https://api.staging.helice.cloud/v2/graphql
BOILERPLATE_API_KEY=...
BOILERPLATE_ORDER_EDITOR_API_KEY=...
BOILERPLATE_PORTAL_MODE=open
BOILERPLATE_DEFAULT_LANGUAGE=NL
BOILERPLATE_CURRENCY=€
REVALIDATE_SECRET=f52f2fbc...
BASE_CATEGORY_ID=1324
CHANNEL_ID=621

# Exposed via runtimeConfig.public
NUXT_PUBLIC_GRAPHQL_ENDPOINT=/api/graphql
NUXT_PUBLIC_SITE_URL=https://shop.example.com
NUXT_PUBLIC_PORTAL_MODE=open
NUXT_PUBLIC_CURRENCY=€
NUXT_PUBLIC_CURRENCY_CODE=EUR
NUXT_PUBLIC_URL_PATTERN=page/id/slug
NUXT_PUBLIC_MENU_DEPTH=3
```

**Why**:
- `BOILERPLATE_*` is the server-only namespace shared with propeller-next
  (which uses the exact same names) and propeller-vue's SSR seam
  (`SSR_*` aliases of the same values). Using the same names means the
  three `.env` files stay copy-pasteable.
- `NUXT_PUBLIC_*` is Nuxt's convention for client-exposed runtime config.
  The client SDK gets `endpoint: '/api/graphql'` (the proxy injects the
  key server-side) so no API key reaches the browser.
- `BASE_CATEGORY_ID=1324` is the Quantore root category on staging.
  Change per environment.
- `REVALIDATE_SECRET` is shared with propeller-next — the same backend
  webhook can bust caches in both apps.

**How to apply**:
- New env var? Add to BOTH `.env` and `.env.example` (with a placeholder).
  Expose to client only if needed (`NUXT_PUBLIC_*`).
- Adding the var to `runtimeConfig` in `nuxt.config.ts` is what makes
  Nuxt pick it up — env-var alone isn't enough.
- Server-only secrets MUST go in the top-level `runtimeConfig: { foo: ... }`
  block, NOT `runtimeConfig.public.foo`. Anything in `public` ends up in
  the client bundle.
- Different env per environment? Use `.env.production` / `.env.staging`;
  Nuxt resolves the right file automatically based on `NODE_ENV`.

Related: [[project-anonymous-ssr-caching]], [[project-architecture]].
