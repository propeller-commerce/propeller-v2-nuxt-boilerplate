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

/**
 * Encode listing state into a `router.push` query object — the write-side
 * inverse of `useListingParams`, omitting anything at its default so URLs stay
 * clean. Shared by the machines parts view (and reusable by category/search).
 * Accepts an optional `term` for the machines in-node search.
 */
export function buildListingQuery(
  listing: {
    page: number;
    offset: number;
    sortField: string;
    sortOrder: string;
    filters: Record<string, string[]>;
    minPrice?: number;
    maxPrice?: number;
    term?: string;
  },
  opts: { defaultSortField?: string; defaultSortOrder?: string; defaultOffset?: number } = {},
): Record<string, string> {
  const { defaultSortField = 'CATEGORY_ORDER', defaultSortOrder = 'DESC', defaultOffset = 12 } = opts;
  const query: Record<string, string> = {};
  if (listing.page > 1) query.page = String(listing.page);
  for (const [key, values] of Object.entries(listing.filters)) {
    if (values.length > 0) query[key] = JSON.stringify(values);
  }
  if (listing.minPrice !== undefined) query.minPrice = String(listing.minPrice);
  if (listing.maxPrice !== undefined) query.maxPrice = String(listing.maxPrice);
  if (listing.offset !== defaultOffset) query.offset = String(listing.offset);
  if (listing.sortField !== defaultSortField) query.sortField = String(listing.sortField);
  if (listing.sortOrder !== defaultSortOrder) query.sortOrder = String(listing.sortOrder);
  if (listing.term) query.term = listing.term;
  return query;
}
