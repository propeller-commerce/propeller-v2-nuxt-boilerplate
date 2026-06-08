---
name: project-seed-auth-pinia-ordering
description: `app/plugins/seed-auth.server.ts` MUST declare `dependsOn: ['pinia']` and MUST NOT use `enforce: 'pre'`. The plugin reads the access_token cookie at SSR time and seeds the auth store before <PropellerProvider> renders, but `useAuthStore()` crashes if Pinia isn't installed yet.
metadata:
  type: project
---

**Fact:** `app/plugins/seed-auth.server.ts` (the SSR-only plugin that
seeds the auth store from the `access_token` cookie before
`<PropellerProvider>` renders) MUST be declared as:

```ts
export default defineNuxtPlugin({
  name: 'seed-auth',
  dependsOn: ['pinia'],
  async setup() {
    const token = useCookie('access_token').value;
    if (!token) return;
    // … construct inline GraphQLClient, call services.user.getViewer({})
    const auth = useAuthStore();
    auth.hydrateFromServer(plain, token);
  },
});
```

**What goes wrong without `dependsOn: ['pinia']`:** the plugin runs
BEFORE `@pinia/nuxt`'s `plugin.vue3.js` has installed the Pinia
instance on the SSR app. `useAuthStore()` then throws
"getActivePinia() was called with no active Pinia". That's an
unhandled async rejection in setup() — it crashes the SSR pipeline
mid-render. The downstream symptoms are misleading:

- Browser sees `SyntaxError: Invalid or unexpected token` from Node's
  ESM loader — actually a half-emitted module the crashed SSR pass
  left in Vite's cache.
- `$setup.getCategoryName is not a function` on hydration — the
  truncated payload reaches the client and template bindings can't
  reconcile against the broken VNode tree.

Neither symptom points at Pinia ordering. Verifying the fix means
checking `.nuxt/types/plugins.d.ts` after a `npm run dev` boot —
`@pinia/nuxt/.../plugin.vue3.js` MUST appear above
`app/plugins/seed-auth.server` in the InjectionType chain.

**Why I had it wrong the first time:** the initial version used
`enforce: 'pre'` thinking we needed seed-auth to run before
`<PropellerProvider>` instantiates. We do — but `enforce: 'pre'` puts
us before EVERYTHING (including Pinia). `dependsOn: ['pinia']` is the
right way to say "after Pinia, but before normal plugins."

**Also don't import from `~~/server/utils/infra.ts`** in this plugin
— that file pulls `nitropack/runtime` aliases which only resolve
inside the Nitro runtime context. Importing from a Nuxt server plugin
throws `ERR_PACKAGE_PATH_NOT_EXPORTED` at request time. Inline the
GraphQLClient construction instead.

**How to apply:** any future SSR-only Nuxt plugin that touches a Pinia
store needs `dependsOn: ['pinia']`. The plugin name `@pinia/nuxt`
registers under is literally `'pinia'` (confirmed in
`node_modules/@pinia/nuxt/dist/runtime/plugin.vue3.js`).

Related: [[project-architecture]] (Tier 1/2 wiring),
[[feedback-no-double-refresh]] (other ordering gotcha).
