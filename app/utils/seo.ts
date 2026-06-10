/**
 * Verbatim port of `propeller-vue/frontend/src/lib/seo.ts`. SEO metadata
 * resolvers + JSON-LD context builder used by every catalog page. Reads
 * shared constants (`siteUrl`, `portalMode`, `configuration`) from
 * `./config` — same shape both Vue consumers use.
 */
import type { Contact, Customer, LocalizedString } from '@propeller-commerce/propeller-sdk-v2';
import { stripHtml, type JsonLdContext } from '@propeller-commerce/propeller-v2-vue-ui/shared';
import { configuration, portalMode, siteUrl } from './config';

/** Pick the value for `language` from a localized array, with a first-entry fallback. */
function pick(
  list: LocalizedString[] | undefined,
  language: string,
): string | undefined {
  if (!list?.length) return undefined;
  const match = list.find((l) => l.language === language);
  return (match?.value || list[0]?.value || undefined) ?? undefined;
}

/** Resolve a `<title>` — curated metadata title, else the entity name. */
export function resolveSeoTitle(
  metadataTitles: LocalizedString[] | undefined,
  fallbackName: LocalizedString[] | undefined,
  language: string,
): string | undefined {
  return pick(metadataTitles, language) ?? pick(fallbackName, language);
}

/**
 * Resolve a `<meta name="description">` — curated metadata description, else
 * the first non-empty content fallback (short/long description), HTML stripped.
 */
export function resolveSeoDescription(
  metadataDescriptions: LocalizedString[] | undefined,
  fallbacks: (LocalizedString[] | undefined)[],
  language: string,
): string | undefined {
  const curated = pick(metadataDescriptions, language);
  if (curated) return stripHtml(curated);
  for (const fb of fallbacks) {
    const value = pick(fb, language);
    if (value) return stripHtml(value);
  }
  return undefined;
}

/** Resolve `<meta name="keywords">` from the curated keyword array. */
export function resolveSeoKeywords(
  metadataKeywords: LocalizedString[] | undefined,
  language: string,
): string | undefined {
  return pick(metadataKeywords, language);
}

/** Resolve a canonical URL from the curated canonical-url array. */
export function resolveCanonicalUrl(
  metadataCanonicalUrls: LocalizedString[] | undefined,
  language: string,
): string | undefined {
  return pick(metadataCanonicalUrls, language);
}

/**
 * Build the per-request `JsonLdContext` consumed by `<ProductJsonLd>`,
 * `<ClusterJsonLd>` and `<ItemListJsonLd>`. Centralised here so every view
 * constructs the same shape.
 *
 * Inputs come from the stores the view already has handy (language, user)
 * plus module-level config (siteUrl, portalMode, currencyCode).
 */
export function buildJsonLdContext(args: {
  language: string;
  user: Contact | Customer | null;
}): JsonLdContext {
  return {
    siteUrl,
    language: args.language,
    currencyCode: configuration.currencyCode,
    portalMode,
    user: args.user,
    urls: configuration.urls,
  };
}
