export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'UK', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
];

export const COUNTRIES_MAP: Record<string, string> = COUNTRIES.reduce(
  (acc, c) => {
    acc[c.code] = c.name;
    return acc;
  },
  {} as Record<string, string>
);

export function getCountryName(code: string | null | undefined, list?: Country[] | null): string {
  if (!code) return '';
  const effective = list && list.length > 0 ? list : COUNTRIES;
  const match = effective.find((c) => c.code === code);
  return match?.name ?? code;
}

/** Dutch country names, keyed by ISO 3166-1 alpha-2 code. */
export const COUNTRIES_NL: Country[] = [
  { code: 'NL', name: 'Nederland' },
  { code: 'BE', name: 'België' },
  { code: 'DE', name: 'Duitsland' },
  { code: 'FR', name: 'Frankrijk' },
  { code: 'UK', name: 'Verenigd Koninkrijk' },
  { code: 'US', name: 'Verenigde Staten' },
];

/**
 * Localized country list for the active language. Pass the result as the
 * `countries` prop so dropdowns and address displays render in the page
 * language instead of the built-in English names.
 */
export function getCountries(language?: string): Country[] {
  if ((language || '').toUpperCase() === 'NL') return COUNTRIES_NL;
  return COUNTRIES;
}
