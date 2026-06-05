---
name: project-jsonld-context-shape
description: `JsonLdContext` for the package's JSON-LD builders is { siteUrl, language, currencyCode, portalMode, user, urls } — must include the `urls` field with getProductUrl/getClusterUrl, otherwise ItemListJsonLd throws "Cannot read 'getProductUrl' of undefined".
metadata:
  type: project
---

The shape consumed by `<ItemListJsonLd>`, `<ProductJsonLd>`,
`<ClusterJsonLd>` is fixed by `propeller-v2-core-ui`'s `JsonLdContext`
type:

```ts
{
  siteUrl: string,
  language: string,
  currencyCode: string,         // ISO 4217, distinct from display symbol
  portalMode: string,
  user: Contact | Customer | null | undefined,
  urls: {
    getProductUrl(product, language?): string,
    getClusterUrl(cluster, language?): string,
  }
}
```

**Symptom of getting it wrong (2026-06-05):**
`TypeError: Cannot read properties of undefined (reading 'getProductUrl')
at buildItemListJsonLd`. The builder walks each product and calls
`ctx.urls.getProductUrl(...)` — undefined → throw → Vue tears down the
render tree → category page never displays the grid even though the
catalog data fetched successfully.

**Source of truth:** `app/utils/seo.ts` `buildJsonLdContext()` —
verbatim port of `propeller-vue/frontend/src/lib/seo.ts`. Reads `urls`
from `app/utils/config.ts`'s `configuration` export (also a verbatim port
of propeller-vue's `lib/config.ts`).

**Why I had it wrong:** Initial hand-port returned `{ language,
portalMode, currency, currencyCode, siteUrl, isAnonymous }` — wrong shape
top to bottom. Missing `urls`, missing `user`, extra `currency` and
`isAnonymous` that the package doesn't read. The fix was to mirror
propeller-vue's `lib/seo.ts` line-by-line and let the matching `config.ts`
provide `configuration.urls`.

**How to apply:** Any new view that uses package JSON-LD components
imports `buildJsonLdContext` from `~/utils/seo` and passes it as
`:context`. Never construct the object by hand at the call site — the
shape is non-obvious and the type system only catches it after
TypeScript compilation, not in the source editor (the package uses
`any` in places).

See also: [[project-package-consumption]] for the `urls` factory shape
in `app/utils/config.ts`.
