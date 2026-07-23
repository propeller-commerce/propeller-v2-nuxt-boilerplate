/**
 * Machine (spare-parts) route helpers for the Nuxt app — mirrors
 * propeller-next/lib/machines.ts and propeller-vue's lib/machines.ts.
 *
 * Note: unlike the Vue app, the machine `source`/`language` are NOT read here.
 * `process.env.NUXT_PUBLIC_*` is undefined in the browser bundle, and the
 * machine pages are CSR — so the page reads them from `useRuntimeConfig().public`
 * instead (see app/pages/machines/*). This module only holds the pure helpers.
 */
import { ProductSortField, SortOrder } from '@propeller-commerce/propeller-sdk-v2';
import type { SparePartsMachine, Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';

/** Company track attribute holding the contact's installation ids. */
const MY_INSTALLATIONS = 'MY_INSTALLATIONS';

/**
 * Read the contact's installation ids off the company `MY_INSTALLATIONS` track
 * attribute, resolving which company applies the same way the company store does
 * (`syncFromUser`): the switched company (matched by id in the user's
 * companies), else the default. The company must carry hydrated `.attributes`
 * (the seed-auth plugin + refreshUser fetch them with `companyAttributesInput`).
 * Returns `[]` for anonymous visitors and customers (no company).
 */
export function resolveInstallationIds(
  user: Contact | Customer | null | undefined,
  selectedCompanyId: number | undefined,
): string[] {
  const contact = user && 'contactId' in user ? (user as Contact) : null;
  if (!contact) return [];
  const company =
    (selectedCompanyId != null &&
      contact.companies?.items?.find((c) => c?.companyId === selectedCompanyId)) ||
    contact.company ||
    null;
  const items = company?.attributes?.items ?? [];
  const match = items.find((i) => i.attributeDescription?.name === MY_INSTALLATIONS);
  return readAttributeStringValues(match?.value);
}

/**
 * Pull a string list off an SDK `AttributeValue`. TEXT → `textValues[].values`
 * (per language), ENUM → `enumValues`; falls back to a comma-split scalar
 * `.value`. Cross-language repeats are deduped, order preserved.
 */
export function readAttributeStringValues(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const v = value as {
    textValues?: { values?: unknown[] }[];
    enumValues?: unknown[];
    value?: unknown;
  };
  const out: string[] = [];
  if (Array.isArray(v.textValues)) {
    for (const tv of v.textValues) for (const s of tv?.values ?? []) out.push(String(s));
  }
  if (Array.isArray(v.enumValues)) {
    for (const s of v.enumValues) out.push(String(s));
  }
  if (out.length === 0 && v.value != null) {
    return String(v.value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

/** Storefront browse depth for the machine tree (the WP reference caps at 5). */
export const MACHINE_MAX_DEPTH = 5;

/** Default sort for a machine's spare-parts list — alphabetical by name. */
export const MACHINE_SORT_FIELD_DEFAULT = ProductSortField.NAME;
export const MACHINE_SORT_ORDER_DEFAULT = SortOrder.ASC;

/** Resolve a machine's slug for a language, falling back to its first. */
export function getMachineSlug(machine: SparePartsMachine, language: string): string {
  return (
    machine.slug?.find((s) => s.language === language)?.value ??
    machine.slug?.[0]?.value ??
    ''
  );
}

/** Resolve a machine's display name for a language, falling back to its first. */
export function getMachineName(
  machine: SparePartsMachine,
  language: string,
  fallback = 'Machine',
): string {
  return (
    machine.name?.find((n) => n.language === language)?.value ??
    machine.name?.[0]?.value ??
    fallback
  );
}

/** Title-case a URL slug for a breadcrumb ancestor (no fetched name available). */
export function machineSlugToLabel(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
