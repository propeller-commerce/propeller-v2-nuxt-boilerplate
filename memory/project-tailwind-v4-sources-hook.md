---
name: project-tailwind-v4-sources-hook
description: Tailwind v4 + @nuxtjs/tailwindcss v7-beta scans only srcDir by default; the tailwindcss:sources:extend hook adds the package's dist/ so utility classes used inside the package compile into the bundle.
metadata:
  type: project
---

`@nuxtjs/tailwindcss` v7-beta uses Tailwind v4's **CSS-based `@source`
scanning** — NOT the `content` array in `tailwind.config.ts`. By default
the module only seeds `srcDir` (i.e. `app/`). That means utility classes
that appear ONLY inside compiled package components (`propeller-v2-vue-ui`)
were never emitted: `lg:w-64`, `lg:grid-cols-3`, etc. were missing from
the final CSS, so the catalog grid layout collapsed (aside stretched full
width, products column squeezed to a thin strip on the right).

**Fix:** add a `hooks.tailwindcss:sources:extend` hook in `nuxt.config.ts`
that pushes the package's dist directory into the sources array:

```ts
hooks: {
  'tailwindcss:sources:extend': (sources) => {
    sources.push({
      type: 'path',
      source: 'D:/laragon/www/propeller-nuxt/node_modules/propeller-v2-vue-ui/dist',
    });
  },
},
```

After the hook, `.nuxt/tailwindcss/sources.css` contains both `app/` and
the package's `dist/`, and the compiled bundle grows from ~88KB to ~125KB
(~40% more classes — all the package's own utility usage).

**Why:** Verbatim port of the symptom from the 2026-06-05 session — user
saw the filters aside spanning full container width with products at
zero width on the right. Initial diagnosis hunted for a flex layout bug,
but the real cause was Tailwind never emitting `lg:w-64`. Wasted ~30
minutes chasing the wrong layer.

**How to apply:** Any time a class WORKS in `app/` and BREAKS inside a
package component, check `.nuxt/tailwindcss/sources.css` first — if the
package's dist isn't listed there, the class won't be in the CSS bundle
no matter how correct the markup is.

There's an `app/assets/css/app.css` `@media (min-width: 1024px)` safety
net (`.propeller-catalog-grid`, `.propeller-catalog-aside`, the
`.propeller-header-search` display switch) — kept as belt-and-suspenders
in case any future tooling regression breaks the `lg:` resolution again.

See also: [[project-clientonly-grid]] for the related package wrapping
pattern; [[feedback-cache-driver-memory-only-dev]] for another v4-vs-v3
gotcha.
