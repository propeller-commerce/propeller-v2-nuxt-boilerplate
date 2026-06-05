import { getListingInfra } from '../../utils/infra';
import { fetchSearch } from '../../utils/fetchers';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const config = useRuntimeConfig(event);
  const baseCategoryId = Number(config.baseCategoryId ?? config.public.baseCategoryId);
  const term = typeof q.term === 'string' ? q.term : '';

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

  return fetchSearch(infra, baseCategoryId, term, {
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
