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
