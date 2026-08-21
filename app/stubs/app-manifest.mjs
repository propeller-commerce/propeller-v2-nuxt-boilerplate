// Stub for the Nuxt `#app-manifest` virtual module. Aliased from
// nuxt.config.ts so Vite's pre-transform import-analysis stops failing
// to resolve the dynamic import in nuxt/dist/app/composables/manifest.js.
//
// Safe to be empty: the runtime branch that imports `#app-manifest` is
// gated by `experimental.appManifest`, which we leave at its default
// (false). The code path never actually runs.
export default { id: 'stub', timestamp: 0, matcher: {}, prerendered: [] };
