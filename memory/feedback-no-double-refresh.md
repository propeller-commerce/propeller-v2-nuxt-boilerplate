---
name: feedback-no-double-refresh
description: Don't call refreshNuxtData() alongside per-page useFetch watchers — they race and the in-flight request gets AbortController-canceled.
metadata:
  type: feedback
---

Rule: when a Pinia store value (companyId / includeTax / language) is
already in a page's `useFetch` `key:` + `watch:`, do NOT additionally
call `refreshNuxtData()` from `app.vue` or a handler.

**Why:** Both triggers fire on the same reactivity tick. The first
request goes out; the second one starts; AbortController kills the first.
The user sees a request in DevTools that's `(canceled)`, no data renders,
and the page goes blank or stale until the second one finishes.

Symptom from the 2026-06-05 session: company switch produced one 200 and
one `(canceled)` request, and the page stopped showing results entirely
when the cancellation landed.

**How to apply:** Pick one of:
- (Preferred) Per-page `useFetch` keys/watches OWN the refresh. No
  refresh calls anywhere else.
- (Fallback) `refreshNuxtData()` only fires for state NOT in any page's
  `useFetch` watch — i.e. truly global page-state changes.

Removed from this repo on 2026-06-05:
- `watch(() => company.companyId) → refreshNuxtData()` in `app.vue`
- `watch(() => price.includeTax) → refreshNuxtData()` in `app.vue`
- `await refreshNuxtData()` inside `handleCompanyChange()` in `AppHeader.vue`

Each catalog page (`category/[id]/[slug]`, `search`, `product`,
`cluster`) already has `companyStore.companyId` in its `useFetch`
`key:` + `watch:`, so the company switch path produces exactly one
fetch end-to-end.

See also: [[project-vat-display-only-company-refetches]] for which
state ends up in the key vs. what stays out.
