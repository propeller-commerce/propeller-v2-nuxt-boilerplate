import { computed } from 'vue';
import { useRoute } from 'vue-router';

/**
 * Parse listing params (page, offset, sort, filters, price range) from
 * `route.query`. Mirrors propeller-next's `parseListingParams`.
 */
export interface ListingParams {
  page: number;
  offset: number;
  sortField: string;
  sortOrder: 'ASC' | 'DESC';
  filters: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
}

function parseFiltersFromQuery(query: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(query)) {
    if (['page', 'offset', 'sortField', 'sortOrder', 'minPrice', 'maxPrice'].includes(key)) continue;
    if (typeof raw !== 'string') continue;
    try {
      const decoded = JSON.parse(raw);
      if (Array.isArray(decoded)) out[key] = decoded.map(String);
    } catch {
      // ignore malformed
    }
  }
  return out;
}

export function useListingParams(defaultSortField = 'CATEGORY_ORDER') {
  const route = useRoute();
  return computed<ListingParams>(() => {
    const q = route.query as Record<string, unknown>;
    const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
    const offset = Math.max(1, parseInt(String(q.offset ?? '12'), 10) || 12);
    const sortField = typeof q.sortField === 'string' ? q.sortField : defaultSortField;
    const sortOrder = q.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const filters = parseFiltersFromQuery(q);
    const minPrice = q.minPrice !== undefined ? Number(q.minPrice) : undefined;
    const maxPrice = q.maxPrice !== undefined ? Number(q.maxPrice) : undefined;
    return { page, offset, sortField, sortOrder, filters, minPrice, maxPrice };
  });
}

export function buildTextFilters(filters: Record<string, string[]>) {
  return Object.entries(filters).map(([attributeName, values]) => ({
    attributeName,
    attributeValues: values,
  }));
}
