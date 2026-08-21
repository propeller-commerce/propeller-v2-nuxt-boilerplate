import type { PageType } from './taxonomy';

/**
 * Route name -> page_type.
 *
 * Classifies on the ROUTE NAME, never the path. Nuxt derives names from the file
 * tree, so they are already a clean enum: the `/en` locale prefix never appears
 * in them and the CSR shadow pages are one `startsWith` away. A path regex would
 * have to juggle `/en/product/…` vs `/product/…` vs `/en/csr/product/…` and would
 * silently misclassify `cluster` as `category`.
 *
 * The propeller-vue twin is the same file with its own route names; everything
 * else in this directory is byte-identical between the two repos.
 */

/**
 * Pages whose component emits its own richer `page_viewed` — they hold the
 * entity id and name, so letting the generic hook fire too yields two rows.
 */
const SELF_REPORTING = new Set([
  'category-id-slug',
  'product-productId-slug',
  'cluster-clusterId-slug',
  'search',
  'search-term',
  'cart',
  'checkout',
  'checkout-thank-you-orderId',
]);

const BY_NAME: Record<string, PageType> = {
  index: 'home',
  login: 'login',
  'magic-login': 'login',
  'forgot-password': 'login',
  register: 'register',
  machines: 'machines',
  'machines-slug': 'machines',
  'quick-order': 'quick_order',
  blog: 'blog',
  'blog-slug': 'blog',
  slug: 'cms',
  'terms-conditions': 'cms',
  'authorization-request-sent-cartId': 'thank_you',
};

/** Prefix rules, longest first — `account-quotes` must beat `account`. */
const BY_PREFIX: Array<[string, PageType]> = [
  ['account-quote', 'quote'],
  ['account-price-requests', 'quote'],
  ['account-favorite', 'favorites'],
  ['account', 'account'],
];

export interface PageClassification {
  pageType: PageType;
  entityId: number | null;
}

/**
 * Returns null when the route must not emit a generic `page_viewed`: the CSR
 * shadow pages (they render the same views, so the SSR twin already counted the
 * visit) and every self-reporting page.
 */
export function classifyRoute(
  name: string | null | undefined,
  params: Record<string, unknown> = {}
): PageClassification | null {
  if (!name) return null;
  // `___en` — @nuxtjs/i18n suffixes every route name under
  // `prefix_except_default`. Without this strip EVERY route classifies as `cms`.
  const route = String(name).split('___')[0];

  if (route.startsWith('csr-')) return null;
  if (SELF_REPORTING.has(route)) return null;
  // The analytics dashboard itself. Tracking it would put staff page views in
  // the same table as customer behaviour, on the one page guaranteed to be
  // opened by staff.
  if (route === 'tracker') return null;

  const direct = BY_NAME[route];
  if (direct) return { pageType: direct, entityId: null };

  for (const [prefix, pageType] of BY_PREFIX) {
    if (route.startsWith(prefix)) {
      const id = Number(params.id ?? params.orderId ?? NaN);
      return { pageType, entityId: Number.isFinite(id) ? id : null };
    }
  }

  return { pageType: 'cms', entityId: null };
}

/** Strip the `/en` style locale prefix so paths group across languages. */
export function stripLocalePrefix(path: string): string {
  return /^\/[a-z]{2}(\/|$)/.test(path) ? path.slice(3) || '/' : path;
}
