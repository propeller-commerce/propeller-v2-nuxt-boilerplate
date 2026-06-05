---
name: feedback-cache-driver-memory-only-dev
description: Dev cache storage MUST be 'memory' — fs driver chokes on `:` chars in cache keys
metadata:
  type: feedback
---

**Rule**: In `nuxt.config.ts`, dev cache storage uses the `memory` driver:

```ts
nitro: {
  devStorage: {
    cache: { driver: 'memory' },
  },
},
```

Do NOT switch dev back to the `fs` driver. The cache keys built by
`server/utils/fetchers.ts` contain `:` (e.g.
`sdk:category:1324:lang=nl:...`) which the unstorage fs driver translates
to file path separators, producing paths like
`.nitro/cache/sdk/category/1324/{...}` where the parent dirs don't get
created. Result: every cached call throws
`ENOENT: no such file or directory`.

**Why**: this took 10 minutes to diagnose during the bootstrap. The error
message points at the file write, not the key encoding, so it looks like
a filesystem issue.

**How to apply**:
- Production should map `cache` to Redis (the wrapper is driver-agnostic):
  ```ts
  nitro: {
    storage: {
      cache: { driver: 'redis', url: process.env.REDIS_URL },
    },
  },
  ```
- If you really need fs persistence in dev (testing the bust-by-tag flow
  across restarts), re-encode the cache keys to use `__` instead of `:`
  in `server/utils/fetchers.ts` first. But the simpler fix is to use
  the memory driver for dev and Redis for prod.
- Do not assume "fs driver works for everything" — unstorage drivers
  vary in their key encoding behaviour.

Related: [[project-anonymous-ssr-caching]], [[project-server-seam-imports]].
