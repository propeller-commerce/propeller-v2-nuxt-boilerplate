/**
 * Language settings, resolved here and inlined into both bundles.
 *
 * `app/utils/config.ts` exports pure helpers (`localizeHref`,
 * `detectLanguageFromPath`) used from module scope, so they cannot call
 * `useRuntimeConfig()`. They read `process.env.NUXT_PUBLIC_DEFAULT_LANGUAGE`,
 * which is undefined in the browser bundle and which nothing set anyway — so
 * the default language was always 'NL' and an `--default-locale=en` shop
 * served Dutch at `/`. `BOILERPLATE_DEFAULT_LANGUAGE` is what the scaffolder
 * writes; the `NUXT_PUBLIC_` form stays as an explicit override.
 */
const DEFAULT_LANGUAGE = (
  process.env.NUXT_PUBLIC_DEFAULT_LANGUAGE ||
  process.env.BOILERPLATE_DEFAULT_LANGUAGE ||
  'NL'
).toUpperCase();

/** Every language the shop ships — hardcoded `['NL','EN']` before. */
const SUPPORTED_LANGUAGES = (process.env.BOILERPLATE_LOCALES || 'nl,en')
  .split(',')
  .map((code) => code.trim().toUpperCase())
  .filter(Boolean);

/** BCP 47 tag per language code, for the routing module's `language` field. */
const LOCALE_TAGS: Record<string, string> = {
  NL: 'nl-NL',
  EN: 'en-US',
  FR: 'fr-FR',
  DE: 'de-DE',
  ES: 'es-ES',
  IT: 'it-IT',
  PL: 'pl-PL',
  PT: 'pt-PT',
};

// Same build-time inlining as the language constants above. `app/utils/config.ts`
// is a plain module, so its `process.env` reads are undefined in the browser
// bundle and empty in a built Nitro server — `baseCategoryId` arrived as
// undefined, which emptied the header menu and made search suggestions and
// quick order search category 0. (PWP-1044/1045/1046)
const BASE_CATEGORY_ID = (() => {
  const raw = process.env.NUXT_PUBLIC_BASE_CATEGORY_ID || process.env.BASE_CATEGORY_ID;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
})();
const MENU_DEPTH = parseInt(process.env.NUXT_PUBLIC_MENU_DEPTH || '3', 10);
const CHANNEL_ID = parseInt(process.env.NUXT_PUBLIC_CHANNEL_ID || process.env.CHANNEL_ID || '1', 10);
const PORTAL_MODE = (process.env.NUXT_PUBLIC_PORTAL_MODE || 'open').trim().toLowerCase();
const SITE_URL = (process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
const URL_PATTERN = process.env.NUXT_PUBLIC_URL_PATTERN || 'page/id/slug';
const CURRENCY = process.env.NUXT_PUBLIC_CURRENCY || '€';
const CURRENCY_CODE = process.env.NUXT_PUBLIC_CURRENCY_CODE || 'EUR';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  future: { compatibilityVersion: 4 },

  // Source root. With compatibilityVersion: 4 Nuxt defaults this to 'app/'
  // anyway, but pinning it explicitly avoids surprises across minor bumps.
  srcDir: 'app/',
  serverDir: 'server/',

  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxtjs/i18n', '@nuxtjs/tailwindcss', '@nuxt/eslint'],

  // This app had no linting at all. `@nuxt/eslint` generates the flat config
  // that knows about Nuxt's auto-imports and generated `.nuxt` types, which a
  // hand-written config gets wrong (every `useRoute`, `defineNuxtPlugin` and
  // `$fetch` reads as undefined). `eslint.config.mjs` at the repo root extends
  // what it produces; `standalone: false` lets it include the type-aware rules.
  eslint: {
    config: {
      // Stylistic rules are formatting, not correctness. Enabling them would
      // rewrite most of the templates and bury the real findings.
      stylistic: false,
    },
  },

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
    // ── Behaviour tracking ──────────────────────────────────────
    // Server-only. NEVER move these into `public` — that would ship the
    // database credentials to the browser.
    trackingEnabled: process.env.TRACKING_ENABLED || '',
    trackingDbUrl: process.env.TRACKING_DB_URL || '',
    trackingDbSocket: process.env.TRACKING_DB_SOCKET || '',
    trackingDbHost: process.env.TRACKING_DB_HOST || '',
    trackingDbPort: process.env.TRACKING_DB_PORT || '',
    trackingDbUser: process.env.TRACKING_DB_USER || '',
    trackingDbPassword: process.env.TRACKING_DB_PASSWORD || '',
    trackingDbName: process.env.TRACKING_DB_NAME || '',
    trackingDbSsl: process.env.TRACKING_DB_SSL || '',
    trackingTimezone: process.env.TRACKING_TIMEZONE || 'Europe/Amsterdam',
    revalidateSecret: process.env.REVALIDATE_SECRET || '',
    // ── Outgoing mail (price requests) ──────────────────────────
    // Server-only. SMTP credentials must never reach the browser.
    mailProvider: process.env.MAIL_PROVIDER || 'smtp',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT || '587',
    smtpSecure: process.env.SMTP_SECURE || '',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFromEmail: process.env.SMTP_FROM_EMAIL || '',
    smtpFromName: process.env.SMTP_FROM_NAME || '',
    smtpReplyTo: process.env.SMTP_REPLY_TO || '',
    priceRequestToEmail: process.env.PRICE_REQUEST_TO_EMAIL || '',
    mailAccentColor: process.env.MAIL_ACCENT_COLOR || '',
    // Env override only — the channel's catalogRootId is the fallback, resolved
    // server-side by resolveBaseCategoryId(). No literal here.
    baseCategoryId: process.env.BASE_CATEGORY_ID || '',
    channelId: process.env.CHANNEL_ID || '1',

    // ── Payments (Mollie PSP) — server-only ─────────────────────────────────
    // The Mollie keys + webhook config never reach the client. The three
    // /api/mollie/* Nitro routes read these via useRuntimeConfig(event). The
    // client-visible toggles (provider on/off, on-account method codes) live
    // under `public` below. Mirrors propeller-vue's server/client env split.
    // `paymentProvider` selects the active PSP: '' (none) | 'mollie' |
    // 'multisafepay'. Only one is active at a time; the matching key block below
    // is read. The client-visible copy lives under `public` for the checkout gate.
    paymentProvider: process.env.PAYMENT_PROVIDER || '',
    mollieLiveKey: process.env.MOLLIE_LIVE_KEY || '',
    mollieTestKey: process.env.MOLLIE_TEST_KEY || '',
    mollieTestMode: process.env.MOLLIE_TEST_MODE || 'true',
    // Explicit webhook URL override (point at a tunnel in dev). When empty the
    // webhook URL is derived from NUXT_PUBLIC_SITE_URL + /api/mollie/webhook.
    mollieWebhookUrl: process.env.MOLLIE_WEBHOOK_URL || '',
    // MultiSafepay keys + mode — read by the /api/msp/* Nitro routes when
    // PAYMENT_PROVIDER=multisafepay. Same server-only posture as Mollie above.
    mspLiveKey: process.env.MSP_LIVE_KEY || '',
    mspTestKey: process.env.MSP_TEST_KEY || '',
    mspTestMode: process.env.MSP_TEST_MODE || 'true',
    // Explicit webhook override; empty → NUXT_PUBLIC_SITE_URL + /api/msp/webhook.
    mspWebhookUrl: process.env.MSP_WEBHOOK_URL || '',
    // Optional MultiSafepay locale (default en_US in the package when empty).
    mspLocale: process.env.MSP_LOCALE || '',
    // Comma-separated method codes that settle "on account" (no PSP).
    onAccountPayments: process.env.ON_ACCOUNT_PAYMENTS || '',

    // ── PunchOut (OCI + cXML) — server-only ─────────────────────────────────
    // The /api/punchout/* Nitro routes read these via useRuntimeConfig(event).
    // Wire-format logic lives in @propeller-commerce/propeller-v2-punchout; the
    // glue is in server/utils/punchout.ts. Secrets never reach the client.
    punchoutEnabled: process.env.PUNCHOUT_ENABLED || '',
    // Candidate buyer contact ids (CSV) = the plugin's PROPELLER_CXML_CONTACT_ID.
    // Each contact's CXML_SHARED_SECRET track attribute is compared to the
    // inbound cXML SharedSecret.
    cxmlContactId: process.env.CXML_CONTACT_ID || '',
    punchoutCurrency: process.env.PUNCHOUT_CURRENCY || 'EUR',
    punchoutTransferTarget: process.env.PUNCHOUT_TRANSFER_TARGET || '_self',
    // Debug: transfer renders a readable OCI/cXML preview instead of auto-POST.
    punchoutDebug: process.env.PUNCHOUT_DEBUG || '',

    public: {
      // The client talks to /api/graphql by default (proxy injects apikey
      // server-side). Override to point at the upstream endpoint directly
      // only when the SDK key is a public read-only credential.
      graphqlEndpoint: process.env.NUXT_PUBLIC_GRAPHQL_ENDPOINT || '/api/graphql',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
      portalMode: process.env.NUXT_PUBLIC_PORTAL_MODE || 'open',
      currency: process.env.NUXT_PUBLIC_CURRENCY || '€',
      currencyCode: process.env.NUXT_PUBLIC_CURRENCY_CODE || 'EUR',
      // Env override only — the channel's catalogRootId is the fallback, resolved
    // server-side by resolveBaseCategoryId(). No literal here.
    baseCategoryId: process.env.BASE_CATEGORY_ID || '',
      channelId: process.env.CHANNEL_ID || '1',
      urlPattern: process.env.NUXT_PUBLIC_URL_PATTERN || 'page/id/slug',
      menuDepth: process.env.NUXT_PUBLIC_MENU_DEPTH || '3',
      // Machines / spare parts. Read on the client via useRuntimeConfig().public
      // — the machine pages are CSR and process.env.NUXT_PUBLIC_* is undefined in
      // the browser bundle, so the source/language must live here (not the
      // process.env reads in app/utils/config.ts). `source` empty = disabled.
      machineSource: process.env.NUXT_PUBLIC_MACHINE_SOURCE || process.env.BOILERPLATE_MACHINE_SOURCE || '',
      machineLanguage: process.env.NUXT_PUBLIC_MACHINE_LANGUAGE || process.env.BOILERPLATE_MACHINE_LANGUAGE || 'EN',
      defaultLanguage: DEFAULT_LANGUAGE,
      supportedLanguages: SUPPORTED_LANGUAGES,
      siteName: process.env.NUXT_PUBLIC_SITE_NAME || 'Propeller Shop',
      logoUrl: process.env.NUXT_PUBLIC_LOGO_URL || '/propeller_logo.webp',
      logoAlt: process.env.NUXT_PUBLIC_LOGO_ALT || 'Propeller',
      // Comma-separated product ids for the home page's featured slider.
      // Empty = no featured block (ids are tenant-specific, so a fresh
      // scaffold ships none rather than another tenant's).
      featuredProductIds: process.env.NUXT_PUBLIC_FEATURED_PRODUCT_IDS || '',
      footerDescription: process.env.NUXT_PUBLIC_FOOTER_DESCRIPTION || '',
      footerEmail: process.env.NUXT_PUBLIC_FOOTER_EMAIL || 'info@propeller.com',
      footerPhone: process.env.NUXT_PUBLIC_FOOTER_PHONE || '+31 (0) 20 000 0000',

      // ── Payments (Mollie PSP) — client-visible toggles ────────────────────
      // The checkout view uses these to decide the placement order status and
      // whether to start a Mollie payment. NOT the secret keys (those stay
      // server-only above). Mirrors propeller-vue's VITE_PAYMENT_PROVIDER /
      // VITE_ON_ACCOUNT_PAYMENTS. The server route re-applies the on-account
      // rule against the server-only `onAccountPayments` as defense in depth.
      // Tracking + GA4, client-visible. Strings on purpose — see above.
      trackingEnabled: process.env.NUXT_PUBLIC_TRACKING_ENABLED || '',
      useGa4: process.env.NUXT_PUBLIC_USE_GA4 || '',
      ga4Key: process.env.NUXT_PUBLIC_GA4_KEY || '',
      gtmKey: process.env.NUXT_PUBLIC_GTM_KEY || '',
      paymentProvider: process.env.NUXT_PUBLIC_PAYMENT_PROVIDER || '',
      onAccountPayments: process.env.NUXT_PUBLIC_ON_ACCOUNT_PAYMENTS || '',
    },
  },

  // Routing only — the shop's own strings come from `useTranslations`, not from
  // this module's dictionaries. Locales are derived from the same env the rest
  // of the config reads, so `--locales` / `--default-locale` decide which
  // languages have a URL: the default unprefixed, the others under `/<code>`.
  i18n: {
    defaultLocale: DEFAULT_LANGUAGE.toLowerCase(),
    // Default language unprefixed, /<code>/ for the rest. Matches
    // propeller-next localizeHref() output byte-for-byte.
    strategy: 'prefix_except_default',
    locales: SUPPORTED_LANGUAGES.map((code) => ({
      code: code.toLowerCase(),
      language: LOCALE_TAGS[code] ?? code.toLowerCase(),
    })),
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
    // Inlined so the pure helpers in app/utils/config.ts see the same values in
    // the server and browser bundles — see the note above the constants.
    define: {
      __DEFAULT_LANGUAGE__: JSON.stringify(DEFAULT_LANGUAGE),
      __SUPPORTED_LANGUAGES__: JSON.stringify(SUPPORTED_LANGUAGES),
      __BASE_CATEGORY_ID__: JSON.stringify(BASE_CATEGORY_ID ?? null),
      __MENU_DEPTH__: JSON.stringify(MENU_DEPTH),
      __CHANNEL_ID__: JSON.stringify(CHANNEL_ID),
      __PORTAL_MODE__: JSON.stringify(PORTAL_MODE),
      __SITE_URL__: JSON.stringify(SITE_URL),
      __URL_PATTERN__: JSON.stringify(URL_PATTERN),
      __CURRENCY__: JSON.stringify(CURRENCY),
      __CURRENCY_CODE__: JSON.stringify(CURRENCY_CODE),
    },
    resolve: {
      alias: {
        '#app-manifest': new URL('./app/stubs/app-manifest.mjs', import.meta.url).pathname,
      },
    },
    // Vite enforces a Host-header allowlist on its dev server. A public dev
    // tunnel (cloudflared / ngrok) sends its own hostname, which Vite rejects
    // with "This host (...) is not allowed" — and Mollie needs a public tunnel
    // to reach the /api/mollie/webhook in dev. Allow the common tunnel
    // providers' wildcard subdomains, plus anything in DEV_ALLOWED_HOSTS
    // (comma-separated) for other tunnels. `vite.server` only affects the dev
    // server — never the production build / Nitro output.
    server: {
      allowedHosts: [
        '.trycloudflare.com',
        '.ngrok-free.app',
        '.ngrok.io',
        '.loca.lt',
        ...(process.env.DEV_ALLOWED_HOSTS || '')
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean),
      ],
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
