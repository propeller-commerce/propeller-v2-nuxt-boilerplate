---
name: project-package-consumption
description: propeller-v2-vue-ui consumption — github: pin, build.transpile, entries
metadata:
  type: project
---

**Fact**: `propeller-v2-vue-ui` is pinned via
`github:propeller-commerce/propeller-v2-vue-ui#master` (mirror of the
GitLab origin). The same pin propeller-vue uses — no `--install-links`,
no local file paths.

Three entry points used:
- `propeller-v2-vue-ui` — main client surface (components, composables,
  provider, `createServices`, `propellerVue` plugin).
- `propeller-v2-vue-ui/shared` — runtime-agnostic exports (`createServices`,
  `toPlain`, types, `MenuCategory`). Safe to import server-side.
- `propeller-v2-vue-ui/styles.css` — bundled Tailwind output, loaded via
  `css` in `nuxt.config.ts`.

The package ships untranspiled `.vue` SFCs + ESM in `dist/`, so
`nuxt.config.ts` MUST include the package in `build.transpile`:

```ts
build: {
  transpile: ['propeller-v2-vue-ui', '@propeller-commerce/propeller-sdk-v2'],
}
```

**Why**: without `build.transpile`, Nuxt's server build can't process the
package's `.vue` files and ESM imports. Skipping it manifests as cryptic
SSR errors (unparseable `<script setup>`, missing imports).

**How to apply**:
- Edit components / composables / contexts in the package repo
  (`D:/laragon/www/propeller-ui/propeller-v2-vue-ui`), not here. Bump the
  package version + push to GitLab; the GitHub mirror catches up.
- Need a server-only helper from the package? Import from
  `propeller-v2-vue-ui/shared` so you don't drag the full client surface.
- Need a label translation? Use `useTranslations('<Namespace>')` from
  `app/composables/useTranslations.ts` — currently a stub returning `{}`,
  which makes the package fall back to its English defaults. Copy real
  namespace JSON dictionaries from `propeller-vue/src/locales/{en,nl}/`
  when needed.
- No singleton `graphqlClient` in this app. The plugin instantiates one
  per request server-side (no cross-request auth leakage).

Related: [[project-architecture]], [[project-clientonly-grid]].
