---
name: project-vat-display-only-company-refetches
description: Company switch re-fetches catalog data (price calc is server-side scoped to company); VAT toggle is a pure display switch on the same data — both gross and net come back in every response.
metadata:
  type: project
---

The two Tier-2 switchers behave differently:

**Company switcher** → re-fetch.

The SDK's price calculation runs server-side scoped to the active
`companyId`. Different company can mean different price-sheet, different
discount tier, different unit price. So switching company demands a fresh
catalog query.

Wiring:
- `priceStore.setSelectedCompany(comp)` writes `selected_company_id`
  cookie + bumps reactive `companyId`.
- Catalog page `useFetch` keys include `:company=${companyStore.companyId}`
  and `watch: [..., () => companyStore.companyId]` — so a swap fires
  exactly one re-fetch.
- We forward `companyId` as an explicit query param (`?companyId=42`),
  NOT just via cookie. The cookie path stays as fallback but the query
  param makes the dependency visible to Nuxt's `useFetch` deduplicator.

**VAT toggle** → display switch only, NO refetch.

The catalog response carries both `price.gross` (excl. VAT) and
`price.net` (incl. VAT) for every product. Toggling `includeTax` just
picks which one displays.

Wiring:
- `priceStore.setIncludeTax(val)` writes `price_include_tax` cookie +
  bumps reactive `includeTax`. (Don't assign `priceStore.includeTax = X`
  directly — that bypasses the cookie write.)
- Catalog page `useFetch` does NOT include `includeTax` in the key or
  watch — it's not a fetch dimension.
- We pass `:includeTax="priceStore.includeTax"` explicitly to every price
  component (`<ProductGrid>`, `<ProductPrice>`, `<ProductBulkPrices>`,
  `<ProductSlider>`) — the package's `useInfraProps` checks explicit
  props first, falls back to context. Explicit prop skips any context-
  reactivity ambiguity and the price re-renders instantly with no network
  call.

**Why explicit, not via PropellerProvider only:** PropellerProvider does
expose `includeTax` reactively via the scope getter, but the package's
0.3.6 components only reliably re-render on the explicit prop path. Per
[[project-package-consumption]] and the Vue-side equivalent of
`react-ui-030-type-loosening-not-retrofit`, only some components fully
retrofitted context reads. Passing the prop is the safer pattern across
the matrix.

**How to apply:** Any new price-rendering surface added to a catalog page
needs `:includeTax="priceStore.includeTax"`. Any new server-scoped
dependency (e.g. a future "currency switcher") needs to go into the
`useFetch` key + watch + query param trio.

**PriceToggle gotcha:** The package's `<PriceToggle>` accepts
`inclExclVatSwitched` (NOT `onToggle`). Wire the handler there:

```vue
<PriceToggle
  :inclExclVatSwitched="(val: boolean) => priceStore.setIncludeTax(val)"
  ...
/>
```

See also: [[project-cookie-bridges]] for the cookie write detail;
[[project-pinia-stores]] for the store shape; [[feedback-no-double-refresh]]
for the related useFetch race fix.
