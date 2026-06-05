import { getListingInfra } from '../../utils/infra';
import { fetchCluster } from '../../utils/fetchers';

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
  return fetchCluster(infra, id, typeof q.language === 'string' ? q.language : undefined);
});
