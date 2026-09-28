import { registry, CANONICAL_LOCALE } from '../../../app/locales/_registry';

/**
 * Read a locale namespace on the server.
 *
 * Imports the generated registry by relative path rather than the `~` alias:
 * inside Nitro `~` resolves to the server directory, not `app/`, so the alias
 * form does not build here.
 */
export function getTranslations(locale: string, namespace: string): Record<string, string> {
  const all = registry as Record<string, Record<string, Record<string, string>>>;
  const canonical = all[CANONICAL_LOCALE] ?? {};
  // A locale with no dictionary of its own reads the canonical one rather than
  // {}: an empty namespace renders every label as an empty string.
  const langRegistry = all[String(locale || '').toLowerCase()] ?? canonical;
  return langRegistry[namespace] ?? canonical[namespace] ?? {};
}

/** Namespace lookup with a fallback, as getLabel does client-side. */
export function labeller(dict: Record<string, string>) {
  return (key: string, fallback: string): string => dict[key] || fallback;
}
