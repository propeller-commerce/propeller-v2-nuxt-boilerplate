// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },

  // Source root. With compatibilityVersion: 4 Nuxt defaults this to 'app/'
  // anyway, but pinning it explicitly avoids surprises across minor bumps.
  srcDir: 'app/',
  serverDir: 'server/',

  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxtjs/i18n', '@nuxtjs/tailwindcss'],

  hooks: {
    // Tailwind v4 + @nuxtjs/tailwindcss v7-beta uses CSS-based @source scanning
    // and only seeds `srcDir` by default. Tell it to also scan the package's
    // compiled dist so classes used INSIDE @propeller-commerce/propeller-v2-vue-ui components
    // (grid layouts, responsive variants, etc.) are emitted in the bundle.
    // Without this the package renders with most Tailwind classes missing
    // and the layout collapses.
    'tailwindcss:sources:extend': (sources) => {
      sources.push({
        type: 'path',
        source: './node_modules/@propeller-commerce/propeller-v2-vue-ui/dist',
      });
    },
  },

  css: ['@propeller-commerce/propeller-v2-vue-ui/styles.css', '~/assets/css/app.css'],

  // The package ships untranspiled .vue/SFC ESM in dist; Nuxt's server build
  // needs Vite's vue plugin to process it. Same posture as propeller-vue
  // (build.transpile feeds the SSR/Vite pipeline for both runtimes).
  build: {
    transpile: ['@propeller-commerce/propeller-v2-vue-ui', '@propeller-commerce/propeller-sdk-v2'],
  },

  runtimeConfig: {
    // Server-only — never reach the client bundle.
    boilerplateGraphqlEndpoint: process.env.BOILERPLATE_GRAPHQL_ENDPOINT || '',
    boilerplateApiKey: process.env.BOILERPLATE_API_KEY || '',
    boilerplateOrderEditorApiKey: process.env.BOILERPLATE_ORDER_EDITOR_API_KEY || '',
    boilerplatePortalMode: process.env.BOILERPLATE_PORTAL_MODE || 'open',
    boilerplateDefaultLanguage: process.env.BOILERPLATE_DEFAULT_LANGUAGE || 'NL',
    boilerplateCurrency: process.env.BOILERPLATE_CURRENCY || '€',
    revalidateSecret: process.env.REVALIDATE_SECRET || '',
    baseCategoryId: process.env.BASE_CATEGORY_ID || '17',
    channelId: process.env.CHANNEL_ID || '1',

    // ── Payments (Mollie PSP) — server-only ─────────────────────────────────
    // The Mollie keys + webhook config never reach the client. The three
    // /api/mollie/* Nitro routes read these via useRuntimeConfig(event). The
    // client-visible toggles (provider on/off, on-account method codes) live
    // under `public` below. Mirrors propeller-vue's server/client env split.
    paymentProvider: process.env.PAYMENT_PROVIDER || '',
    mollieLiveKey: process.env.MOLLIE_LIVE_KEY || '',
    mollieTestKey: process.env.MOLLIE_TEST_KEY || '',
    mollieTestMode: process.env.MOLLIE_TEST_MODE || 'true',
    // Explicit webhook URL override (point at a tunnel in dev). When empty the
    // webhook URL is derived from NUXT_PUBLIC_SITE_URL + /api/mollie/webhook.
    mollieWebhookUrl: process.env.MOLLIE_WEBHOOK_URL || '',
    // Comma-separated method codes that settle "on account" (no PSP).
    onAccountPayments: process.env.ON_ACCOUNT_PAYMENTS || '',

    public: {
      // The client talks to /api/graphql by default (proxy injects apikey
      // server-side). Override to point at the upstream endpoint directly
      // only when the SDK key is a public read-only credential.
      graphqlEndpoint: process.env.NUXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      portalMode: process.env.NUXT_PUBLIC_PORTAL_MODE || 'open',
      currency: process.env.NUXT_PUBLIC_CURRENCY || '€',
      currencyCode: process.env.NUXT_PUBLIC_CURRENCY_CODE || 'EUR',
      baseCategoryId: process.env.BASE_CATEGORY_ID || '17',
      channelId: process.env.CHANNEL_ID || '1',
      urlPattern: process.env.NUXT_PUBLIC_URL_PATTERN || 'page/id/slug',
      menuDepth: process.env.NUXT_PUBLIC_MENU_DEPTH || '3',
      siteName: process.env.NUXT_PUBLIC_SITE_NAME || 'Propeller Shop',
      logoUrl: process.env.NUXT_PUBLIC_LOGO_URL || '/propeller_logo.webp',
      logoAlt: process.env.NUXT_PUBLIC_LOGO_ALT || 'Propeller',
      footerDescription: process.env.NUXT_PUBLIC_FOOTER_DESCRIPTION || '',
      footerEmail: process.env.NUXT_PUBLIC_FOOTER_EMAIL || 'info@propeller.com',
      footerPhone: process.env.NUXT_PUBLIC_FOOTER_PHONE || '+31 (0) 20 000 0000',

      // ── Payments (Mollie PSP) — client-visible toggles ────────────────────
      // The checkout view uses these to decide the placement order status and
      // whether to start a Mollie payment. NOT the secret keys (those stay
      // server-only above). Mirrors propeller-vue's VITE_PAYMENT_PROVIDER /
      // VITE_ON_ACCOUNT_PAYMENTS. The server route re-applies the on-account
      // rule against the server-only `onAccountPayments` as defense in depth.
      paymentProvider: process.env.NUXT_PUBLIC_PAYMENT_PROVIDER || '',
      onAccountPayments: process.env.NUXT_PUBLIC_ON_ACCOUNT_PAYMENTS || '',
    },
  },

  i18n: {
    defaultLocale: 'nl',
    // NL unprefixed, /en/ for English. Matches propeller-next localizeHref()
    // output byte-for-byte.
    strategy: 'prefix_except_default',
    locales: [
      { code: 'nl', iso: 'nl-NL', file: 'nl.json' },
      { code: 'en', iso: 'en-US', file: 'en.json' },
    ],
    langDir: 'locales',
    detectBrowserLanguage: false,
    // Opt out of the v9 optimizer (deprecated, slated for removal in v10).
    bundle: { optimizeTranslationDirective: false },
  },

  nitro: {
    // Cache + tag-index storage. In dev the default memory driver is
    // enough; production should map `cache` to Redis or another shared
    // store so multi-instance caches reconcile (the cachedSdkFetch
    // wrapper is driver-agnostic — the wire shape is the same).
    devStorage: {
      cache: { driver: 'memory' },
    },
  },

  // Vite scans the dynamic `import("#app-manifest")` in
  // nuxt/dist/app/composables/manifest.js at pre-transform time. The
  // module is a Nitro runtime alias gated by experimental.appManifest;
  // we don't use it, so its dead-code branch never executes — but Vite
  // still complains. Alias it to an empty stub to silence the warning.
  vite: {
    resolve: {
      alias: {
        '#app-manifest': new URL('./app/stubs/app-manifest.mjs', import.meta.url).pathname,
      },
    },
  },

  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
});
