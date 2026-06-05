---
name: project-search-canonical-query-style
description: Search URL is `?q=term` (canonical); the `/search/term` path-style is a legacy alias that redirects via pages/search/[...term].vue — but the SearchBar handler should navigate to query-style directly so SSR uses the term in the fetch.
metadata:
  type: project
---

Two search routes exist:

- `pages/search.vue` — the real implementation. Reads `route.query.q`
  into `searchTerm`, which feeds the `useFetch('/api/catalog/search', {
  query: { term: searchTerm } })` call.
- `pages/search/[...term].vue` — legacy alias for path-style URLs
  (`/search/foo/bar`). Redirects to `/search?q=foo bar` via
  `navigateTo` (server) or `router.replace` (client).

**Why:** propeller-next ships both forms historically. The path-style
exists for SEO-friendly bookmarkable URLs in older content. Both must
work.

**Gotcha that bit us 2026-06-05:** `AppHeader.vue:handleSearch` was
navigating to path-style (`/search/${term}`) — meaning the search.vue
fetch ran with an empty term during SSR (because the path-style alias's
redirect happens AFTER the SSR pass renders search.vue with no `q`
param), then the client redirected to `?q=term` and re-fetched. Net
effect: the user saw "Search Products" (no term) briefly, plus an extra
fetch.

**Fix:** `handleSearch` navigates directly to the canonical form:

```ts
function handleSearch(term: string) {
  const path = localizeHref('/search', languageStore.language);
  router.push(term ? { path, query: { q: term } } : path);
}
```

The catch-all alias stays — it's only hit when someone visits
`/search/foo/bar` directly (bookmark, external link).

**How to apply:** Any new entry point that wants to trigger a search
should call `router.push({ path: '/search', query: { q: term } })` — not
`/search/${term}`. The catch-all is read-only.

See also: [[project-routes-inventory]] for the full route map.
