---
name: feedback-itemsfound-not-totalproducts
description: Staging GraphQL response uses `itemsFound`, NOT `totalProducts` — bit me in early markup
metadata:
  type: feedback
---

**Rule**: When reading the count of products / items from the
`ProductsResponse` shape returned by `services.category.getCategory`,
use `.itemsFound` — NOT `.totalProducts`. The latter is undefined and
silently displays 0.

```ts
// Wrong — always shows 0
<GridToolbar :items-found="(category as any)?.products?.totalProducts ?? 0" />

// Right
<GridToolbar :items-found="(category as any)?.products?.itemsFound ?? 0" />
```

**Why**: misremembered the field name during the initial port from
propeller-next (which uses `.itemsFound` correctly). The staging
response shape is:

```json
{
  "products": {
    "items": [...],
    "itemsFound": 312,
    "offset": 12,
    "page": 1,
    "pages": 26,
    "start": 1,
    "end": 12
  }
}
```

There's no `totalProducts` key at all — the wrong field reads as
`undefined`, which `?? 0` masks.

**How to apply**:
- New page reading product counts? Use `itemsFound`. Same for cluster
  attribute counts (`attributes.itemsFound`).
- New page reading pagination? `offset`, `page`, `pages`, `start`,
  `end` — all present on the same shape.
- If a future SDK schema renames the field, search for `itemsFound`
  globally and update every usage at once.

Related: [[project-routes-inventory]], [[project-verification]].
