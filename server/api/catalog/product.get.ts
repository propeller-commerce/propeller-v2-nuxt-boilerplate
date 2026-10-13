import { getListingInfra } from '../../utils/infra';
import { fetchProduct } from '../../utils/fetchers';

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
  try {
    return await fetchProduct(infra, id, typeof q.language === 'string' ? q.language : undefined);
  } catch (e) {
    // A product outside the visitor's assortment makes the resolver throw. Let
    // that read as "no product" so the page 404s instead of surfacing a 500
    // the page then mistakes for a transient failure (PWP-1015).
    if (/not found|PRODUCT_NOT_FOUND/i.test((e as { message?: string })?.message ?? '')) {
      return null;
    }
    throw e;
  }
});
