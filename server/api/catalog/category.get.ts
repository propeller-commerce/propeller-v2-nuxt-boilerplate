/**
 * GET /api/catalog/category?id=…&page=…&offset=…&sortField=…&sortOrder=…&filters=…&minPrice=…&maxPrice=…&language=…
 *
 * Lets Vue pages fetch SSR catalog data via `useFetch('/api/catalog/category', { query })` —
 * the handler runs in Nitro's context where `useStorage` / `useRuntimeConfig`
 * and our `cachedSdkFetch` wrapper resolve cleanly.
 *
 * The fetch is anonymous-cacheable by default (no cookie reads here); the
 * authenticated bypass kicks in inside `getListingInfra` when the request
 * carries `access_token`.
 */

import { getListingInfra } from '../../utils/infra';
import { fetchCategory } from '../../utils/fetchers';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const id = Number(q.id);
  if (!Number.isFinite(id)) {
    setResponseStatus(event, 400);
    return { error: 'missing or invalid id' };
  }

  const includeTaxParam = typeof q.includeTax === 'string' ? q.includeTax === '1' : undefined;
  const companyIdParam = typeof q.companyId === 'string' && q.companyId ? parseInt(q.companyId, 10) : undefined;
  const infra = await getListingInfra(event, {
    includeTax: includeTaxParam,
    selectedCompanyId: Number.isFinite(companyIdParam) ? companyIdParam : undefined,
  });

  let textFilters: Array<{ attributeName: string; attributeValues: string[] }> | undefined;
  if (typeof q.filters === 'string' && q.filters) {
    try {
      const parsed = JSON.parse(q.filters);
      if (parsed && typeof parsed === 'object') {
        textFilters = Object.entries(parsed as Record<string, string[]>).map(([attributeName, attributeValues]) => ({
          attributeName,
          attributeValues,
        }));
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return fetchCategory(infra, id, {
    page: q.page ? Number(q.page) : undefined,
    offset: q.offset ? Number(q.offset) : undefined,
    sortField: typeof q.sortField === 'string' ? (q.sortField as never) : undefined,
    sortOrder: q.sortOrder === 'ASC' ? ('ASC' as never) : q.sortOrder === 'DESC' ? ('DESC' as never) : undefined,
    textFilters,
    priceFilterMin: q.minPrice ? Number(q.minPrice) : undefined,
    priceFilterMax: q.maxPrice ? Number(q.maxPrice) : undefined,
    language: typeof q.language === 'string' ? q.language : undefined,
  });
});
