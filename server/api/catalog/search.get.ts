import { getListingInfra } from '../../utils/infra';
import { parseTextFiltersParam } from '../../utils/textFilters';
import { fetchSearch, resolveBaseCategoryId } from '../../utils/fetchers';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const config = useRuntimeConfig(event);
  // Env override when configured, else the channel's catalog root (resolved
  // below, once infra exists). Never a literal — an id that doesn't exist on
  // this tenant is what produced "Failed to load menu".
  const configured = Number(config.baseCategoryId || config.public.baseCategoryId);
  const term = typeof q.term === 'string' ? q.term : '';

  const includeTaxParam = typeof q.includeTax === 'string' ? q.includeTax === '1' : undefined;
  const companyIdParam = typeof q.companyId === 'string' && q.companyId ? parseInt(q.companyId, 10) : undefined;
  const infra = await getListingInfra(event, {
    includeTax: includeTaxParam,
    selectedCompanyId: Number.isFinite(companyIdParam) ? companyIdParam : undefined,
  });

  const textFilters = parseTextFiltersParam(q.filters);

  const baseCategoryId =
    Number.isFinite(configured) && configured > 0
      ? configured
      : await resolveBaseCategoryId(infra);

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
