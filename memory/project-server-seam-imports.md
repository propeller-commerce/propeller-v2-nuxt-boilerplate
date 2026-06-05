---
name: project-server-seam-imports
description: server/utils files need explicit h3 / nitropack imports — auto-imports don't reach cross-context callers
metadata:
  type: project
---

**Fact**: Files in `server/utils/*` need explicit `import` statements for
Nitro/H3 helpers that would otherwise be auto-imported inside Nitro
handlers:

```ts
// server/utils/cache.ts
import { useStorage } from 'nitropack/runtime';

// server/utils/infra.ts
import { getCookie } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
```

The auth middleware (`app/middleware/auth.ts`) also explicitly imports
`getCookie` from `'h3'` because the auto-import doesn't reach all
middleware paths.

**Why**: I burned ~30 minutes debugging `useStorage is not defined` and
`getCookie is not defined` errors at runtime. The auto-imports work fine
*inside* Nitro handlers (`server/api/*.ts`), but break when:
- A Vue page dynamic-imports `~~/server/utils/*` (Vite app context).
- A middleware file uses `getCookie` server-side under SSR (depends on
  whether Nuxt processed it through Nitro's auto-import scanner).

**How to apply**:
- New file in `server/utils/`? Add explicit imports for every
  Nitro/H3 helper used. Don't rely on auto-imports.
- Need data from a Vue page server-side? Don't dynamic-import server utils.
  Use `useFetch('/api/catalog/...')` against a `server/api/` endpoint
  instead — Nitro short-circuits same-process calls, so no actual HTTP
  cost.
- New middleware file? Always `import { getCookie } from 'h3'` if you
  read cookies server-side.

Related: [[project-hybrid-ssr]], [[project-anonymous-ssr-caching]].
