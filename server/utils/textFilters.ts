import { AttributeType, type ProductTextFilterInput } from '@propeller-commerce/propeller-sdk-v2';

/**
 * The listing pages' `filters` query param (`{"<attribute>": ["value", …]}`)
 * as API text filters. The URL carries no attribute types, so every filter is
 * sent as TEXT and `retypeTextFilters` corrects the ENUM ones on the retry, as
 * propeller-vue's `buildTextFilters` does. Malformed JSON means no filters.
 */
export function parseTextFiltersParam(raw: unknown): ProductTextFilterInput[] | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const filters = Object.entries(parsed as Record<string, unknown>)
    .map(([name, values]) => ({
      name,
      values: (Array.isArray(values) ? values : [values]).map(String),
      exclude: false,
      type: AttributeType.TEXT,
    }))
    .filter((f) => f.values.length > 0);
  return filters.length ? filters : undefined;
}
