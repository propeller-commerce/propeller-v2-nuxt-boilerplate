---
name: feedback-app-manifest-warning-harmless
description: "#app-manifest pre-transform errors in dev are known Nuxt 3.14 noise — ignore"
metadata:
  type: feedback
---

**Rule**: Don't chase the
`Pre-transform error: Failed to resolve import "#app-manifest" from
"node_modules/nuxt/dist/app/composables/manifest.js"` lines in dev output.
The page still renders.

**Why**: known Nuxt 3.14 transitive ESM resolution warning. The
`#app-manifest` alias resolves at build time via Nuxt's manifest plugin
but Vite's pre-transform pass logs the missing import before the plugin
has registered. It's noise, not a runtime failure.

**How to apply**:
- See this warning during dev boot? Skip past it — focus on lines
  starting with `[Vue warn]` or `ERROR`. If the page actually 500s,
  the cause is elsewhere (see [[project-server-seam-imports]] for the
  common server-util import gotchas).
- Don't downgrade Nuxt to avoid the warning; the warning is benign and
  the framework version is correct.
- If a future Nuxt minor fixes it (3.15+), the warning will disappear
  on its own.

Related: [[project-verification]].
