---
name: project-access-error-view
description: AccessErrorView.vue is the friendly 403/404/generic error card wired into 4 detail pages (orders, quotes, quote-requests, checkout thank-you). Classifies SDK error strings via classifyApiError() in `app/lib/errors.ts` (forbidden | not-found | generic).
metadata:
  type: project
---

**Fact:** `app/components/access/AccessErrorView.vue` is the standard
inline error guard for resource-fetch failures. It replaces raw
GraphQL strings like "Forbidden resource" with a translated card
that has:

- A kind-specific icon (lock for forbidden, magnifier for not-found,
  triangle for generic)
- A title + message from the `ErrorPages` translation namespace
- A back button (defaults to /account/orders for orders, overridable
  via `:backHref` and `:backLabel` props)
- A sign-in CTA shown only when `kind === 'forbidden'` AND the user
  is unauthenticated

Classification lives in `app/lib/errors.ts`:
```ts
classifyApiError(error): 'forbidden' | 'not-found' | 'generic'
```
String-matches the message because the SDK doesn't surface HTTP
status cleanly through the proxy.

**Wired into 4 pages** (commit `7596f25`):

| Page | backHref | backLabel |
|---|---|---|
| `pages/account/orders/[id].vue` | (default `/account/orders`) | (default `backToOrders`) |
| `pages/account/quotes/[id].vue` | `/account/quotes` | `ErrorPages.backToQuotes` |
| `pages/account/quote-requests/[id].vue` | `/account/quote-requests` | `ErrorPages.backToQuoteRequests` |
| `pages/checkout/thank-you/[orderId].vue` | (default `/`) + `class="container mx-auto px-4"` | (default `backToHome`) |

**Important:** the thank-you page didn't have an error branch at all
before this change. The `error` ref was dropped from the `useOrders(...)`
destructure even though the composable returned it. The page just
rendered a perpetual skeleton if the order fetch failed.

**`backLabel` template binding pattern:** because `useTranslations`
returns a `ComputedRef` and Vue templates don't auto-unwrap nested
property access, deref via a computed:

```ts
const errorPagesLabels = useTranslations('ErrorPages');
const errorBackLabel = computed(() => errorPagesLabels.value.backToQuotes);
```

Then bind `:backLabel="errorBackLabel"`. This is the same pattern in
propeller-vue.

**How to apply:** any new detail page that fetches a single resource
by id and could return 403/404 should use this view in its
`v-else-if="error"` branch, NOT a raw `<div>{{ error }}</div>`. Pick
appropriate `backHref` for the listing page.

Cross-consumer: identical surface exists in propeller-vue
(`src/components/access/AccessErrorView.vue`, commit `fa7a4a3`) and
propeller-next (`components/access/AccessErrorView.tsx`, commit `795c896`).

Related: [[project-i18n-locales-registry]] (ErrorPages namespace
lives in the locales/ tree).
