/**
 * Verbatim port of `propeller-vue/frontend/src/lib/config.ts` — the
 * canonical configuration object the propeller-v2-vue-ui package consumes.
 *
 * Only difference: env-var access is via `process.env.NUXT_PUBLIC_*`
 * (which Nuxt inlines into both server and client bundles) instead of
 * `import.meta.env.VITE_*` (Vite-only). Same values, same shape, same
 * runtime behavior. Keep this file structurally identical to the Vue
 * consumer so changes flow in either direction with minimal diff.
 */
import type { Category, Cluster, Product } from '@propeller-commerce/propeller-sdk-v2';
import { Fit, Format } from '@propeller-commerce/propeller-sdk-v2';

// Offset 1 = "first image only" — used in product cards / grids where a single
// thumbnail is enough.
export const imageSearchFiltersGrid = { page: 1, offset: 1 };

// Offset 20 = "all images for this product" — used on detail pages so the
// gallery can render the full set. Keep in sync with nextDemo's data/defaults.ts
// `imageSearchFilters` constant.
export const imageSearchFilters = { page: 1, offset: 20 };

export const imageVariantFiltersSmall = {
  transformations: [{ name: 'thumb', transformation: { format: Format.WEBP, height: 100, width: 100, fit: Fit.BOUNDS } }],
};

export const imageVariantFiltersMedium = {
  transformations: [{ name: 'grid', transformation: { format: Format.WEBP, height: 300, width: 300, fit: Fit.BOUNDS } }],
};

export const imageVariantFiltersLarge = {
  transformations: [{ name: 'large', transformation: { format: Format.WEBP, height: 800, width: 800, fit: Fit.BOUNDS } }],
};

const URL_PATTERN = process.env.NUXT_PUBLIC_URL_PATTERN || 'page/id/slug';

/**
 * Languages with localized URL prefixing. The DEFAULT_LANGUAGE entry stays
 * unprefixed; every other entry gets a `/${lang.toLowerCase()}` prefix on
 * navigation. Keep this list in sync with the router's `:lang(...)` regex.
 */
export const DEFAULT_LANGUAGE = (process.env.NUXT_PUBLIC_DEFAULT_LANGUAGE || 'NL').toUpperCase();
export const SUPPORTED_LANGUAGES = ['NL', 'EN'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Languages that get a URL prefix (everything except the default). */
export const PREFIXED_LANGUAGES = SUPPORTED_LANGUAGES.filter((l) => l !== DEFAULT_LANGUAGE);

function buildEntityUrl(page: string, id?: number | string, slug?: string, pattern?: string, language?: string): string {
  const p = pattern || URL_PATTERN;
  const prefix = language && language.toUpperCase() !== DEFAULT_LANGUAGE
    ? `/${language.toLowerCase()}` : '';
  const parts: string[] = [];
  p.split('/').forEach(token => {
    if (token === 'page') parts.push(page);
    else if (token === 'id' && id) parts.push(String(id));
    else if (token === 'slug' && slug) parts.push(slug);
  });
  return `${prefix}/${parts.join('/')}`;
}

export const baseCategoryId = parseInt(process.env.NUXT_PUBLIC_BASE_CATEGORY_ID || process.env.BASE_CATEGORY_ID || '17', 10);
export const menuDepth = parseInt(process.env.NUXT_PUBLIC_MENU_DEPTH || '3', 10);
// Set NUXT_PUBLIC_CHANNEL_ID per environment to the channel orders/quotes are
// placed on. The account order/quote lists filter by `channelIds: [channelId]`,
// so a wrong value silently returns zero results.
export const channelId = parseInt(process.env.NUXT_PUBLIC_CHANNEL_ID || process.env.CHANNEL_ID || '1', 10);

/**
 * Portal access mode — kebab-case `'open'` | `'semi-closed'` | `'closed'`.
 * Mirrors the React app's `BOILERPLATE_PORTAL_MODE`. The package's
 * `isContentHidden(portalMode, user)` matches on these exact strings; using
 * any other casing leaves the semi-closed gate as a no-op.
 */
export const portalMode = (
  process.env.NUXT_PUBLIC_PORTAL_MODE || 'open'
).trim().toLowerCase() === 'semiclosed' ? 'semi-closed' :
  (process.env.NUXT_PUBLIC_PORTAL_MODE || 'open').trim().toLowerCase();

/**
 * Absolute origin of this site (no trailing slash). Used to build absolute
 * URLs in schema.org / JSON-LD payloads emitted by ProductJsonLd / ClusterJsonLd
 * / ItemListJsonLd. When unset, JSON-LD emits path-only URLs.
 */
export const siteUrl = (process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

/**
 * Prepends `/<lang>` to a path when `language` is non-default. Idempotent —
 * does nothing if the path already starts with the prefix, so it's safe to
 * call multiple times during navigation.
 */
export function localizeHref(path: string, language?: string): string {
  if (!language) return path;
  const lang = language.toUpperCase();
  if (lang === DEFAULT_LANGUAGE) return path;
  const prefix = `/${lang.toLowerCase()}`;
  if (path === prefix || path.startsWith(prefix + '/')) return path;
  return path === '/' ? prefix : `${prefix}${path}`;
}

/**
 * Strips a known supported-language prefix from a pathname, returning the
 * un-prefixed canonical path. Used by the language switcher to compute
 * "the same page in another language" from any current URL.
 */
export function stripLanguagePrefix(pathname: string): string {
  const match = pathname.match(/^\/([a-z]{2})(\/|$)/);
  if (!match) return pathname;
  const seg = match[1].toUpperCase();
  if (!PREFIXED_LANGUAGES.includes(seg as SupportedLanguage)) return pathname;
  const rest = pathname.slice(3); // remove '/xx'
  return rest || '/';
}

/**
 * Detects the language from a URL pathname.
 * Returns the matched supported language, or DEFAULT_LANGUAGE when no prefix.
 */
export function detectLanguageFromPath(pathname: string): SupportedLanguage {
  const match = pathname.match(/^\/([a-z]{2})(\/|$)/);
  if (!match) return DEFAULT_LANGUAGE as SupportedLanguage;
  const seg = match[1].toUpperCase() as SupportedLanguage;
  return PREFIXED_LANGUAGES.includes(seg) ? seg : (DEFAULT_LANGUAGE as SupportedLanguage);
}

export const configuration = {
  imageSearchFilters,
  imageSearchFiltersGrid,
  imageVariantFiltersSmall,
  imageVariantFiltersMedium,
  imageVariantFiltersLarge,
  urlPattern: URL_PATTERN,
  taxZone: 'NL',
  currency: process.env.NUXT_PUBLIC_CURRENCY || '€',
  /** ISO 4217 currency code — used by JSON-LD / schema.org payloads (`priceCurrency`).
   *  Distinct from `currency` above, which is the display symbol shown to humans. */
  currencyCode: process.env.NUXT_PUBLIC_CURRENCY_CODE || 'EUR',
  baseCategoryId,
  menuDepth,
  // Track attributes fetched with the viewer (mirrors propeller-next data/config.ts).
  // companyTrackAttributes MUST include MY_INSTALLATIONS so the machines root can
  // read the contact's installation ids off the company. Hardcoded (not env-
  // derived), so they're correct on both server and client. The machine
  // source/language live in runtimeConfig.public (nuxt.config.ts), not here —
  // process.env.NUXT_PUBLIC_* is undefined in the browser bundle and the machine
  // pages are CSR.
  productTrackAttributes: [] as string[],
  categoryTrackAttributes: [] as string[],
  clusterTrackAttributes: [] as string[],
  companyTrackAttributes: ['MY_INSTALLATIONS'] as string[],
  contactTrackAttributes: [] as string[],
  customerTrackAttributes: [] as string[],
  // Viewer pagination inputs — MUST be GraphQL input *objects*, never `[]`.
  // The viewer query selects `purchaseAuthorizationConfigs(input:)` and
  // `companies(input:)`; an empty array is truthy but the backend rejects it
  // ("Expected type ContactPurchaseAuthorizationConfigSearchInput to be an
  // object"). Present on every viewer fetch so a multi-company / multi-PA
  // contact isn't truncated by the server default page.
  contactPAConfigInput: { page: 1, offset: 50 },
  contactCompaniesSearchInput: { page: 1, offset: 50 },
  urls: {
    getProductUrl(product: Product, language?: string): string {
      const slug = (language && product?.slugs?.find((s: { language?: string; value: string }) => s.language === language)?.value) || product?.slugs?.[0]?.value || '';
      return buildEntityUrl('product', product?.productId, slug, URL_PATTERN, language);
    },
    getClusterUrl(cluster: Cluster, language?: string): string {
      const slugs = cluster?.slugs || (cluster as Cluster & { defaultProduct?: { slugs?: Array<{ language?: string; value: string }> } })?.defaultProduct?.slugs;
      const slug = (language && slugs?.find((s) => s.language === language)?.value) || slugs?.[0]?.value || '';
      return buildEntityUrl('cluster', cluster?.clusterId, slug, URL_PATTERN, language);
    },
    getCategoryUrl(category: Category, language?: string): string {
      const slug = (language && category?.slug?.find((s: { language?: string; value: string }) => s.language === language)?.value) || category?.slug?.[0]?.value || '';
      return buildEntityUrl('category', category?.categoryId, slug, URL_PATTERN, language);
    },
  },
};
