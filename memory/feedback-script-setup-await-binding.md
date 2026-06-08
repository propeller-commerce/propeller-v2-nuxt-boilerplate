---
name: feedback-script-setup-await-binding
description: In Nuxt pages, `function fooName() {…}` declared AFTER a top-level `await useFetch(...)` in <script setup> can fail to expose on the template's $setup proxy. Use `const fooName = computed(() => …)` instead — computed bindings are tracked by name and survive the compiler's two-pass setup analysis.
metadata:
  type: feedback
---

**Rule:** in pages that use top-level `await useFetch(...)` (or any other
top-level await) in `<script setup>`, do NOT use
`function getFooName() { … }` syntax for values rendered in the
template. Use `const fooName = computed(() => …)` instead and bind
`:title="fooName"` (no parens, no `.value`).

**Why:** the Vue SFC compiler analyses script-setup bindings in two
passes — the synchronous setup() return, and post-await additions.
Function declarations placed after a top-level `await` sometimes fail
to surface on the template's `$setup` proxy. The symptom is a 500 on
client hydration with `$setup.<name> is not a function`, even though
SSR rendered the same template cleanly. Vite HMR amplifies the
issue — fresh `.nuxt` boots can work, several HMR cycles later the
binding goes missing.

**Past incident (2026-06-08):** the category page's
`function getCategoryName(): string { … }` (line 304) was called from
the template's `<GridTitle :title="getCategoryName()">` (line 20). The
top-level `await useFetch('/api/catalog/category', …)` (line 195)
separated declaration from setup-return. SSR rendered HTTP 200 with
"Quantore" in the title; on client hydration Vue threw `$setup.getCategoryName
is not a function` and bailed to the 500 error overlay. Converting
to `const categoryName = computed<string>(() => …)` and flipping the
template to `:title="categoryName"` fixed it. See commit
`c8b4e59 fix(category): convert getCategoryName function to computed`.

**How to apply:**
- Always prefer `computed` over `function` for derived values rendered
  in templates of pages that do top-level `await useFetch` /
  `useAsyncData`.
- Event handlers (passed as props, e.g. `:onClick="handleClick"`) are
  also vulnerable — same fix applies (assign to `const`).
- If you see `$setup.<name> is not a function` on a hydrated page,
  this is the first thing to check — find the function declaration's
  line number relative to the nearest top-level `await`.

The cluster/product/search pages all have the same
`function … {}` pattern after `await useFetch`. They don't currently
exhibit the bug, but if it surfaces, apply the same swap.

Related: [[project-clientonly-grid]] (other SSR/hydration gotcha).
