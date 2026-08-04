import { getAnonymousInfra } from '../../utils/infra';
import { fetchMenu, resolveBaseCategoryId } from '../../utils/fetchers';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const language = typeof q.language === 'string' ? q.language : undefined;

  const infra = getAnonymousInfra(event);
  // No explicit rootCategoryId → fall back to the channel's catalog root
  // (`resolveBaseCategoryId`) rather than the hardcoded default.
  const rootCategoryId = q.rootCategoryId
    ? Number(q.rootCategoryId)
    : await resolveBaseCategoryId(infra);
  return fetchMenu(infra, rootCategoryId, language);
});
