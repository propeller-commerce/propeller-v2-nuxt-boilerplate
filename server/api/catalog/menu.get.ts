import { getAnonymousInfra } from '../../utils/infra';
import { fetchMenu } from '../../utils/fetchers';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const config = useRuntimeConfig(event);
  const rootCategoryId = q.rootCategoryId
    ? Number(q.rootCategoryId)
    : Number(config.baseCategoryId ?? config.public.baseCategoryId);
  const language = typeof q.language === 'string' ? q.language : undefined;

  const infra = getAnonymousInfra(event);
  return fetchMenu(infra, rootCategoryId, language);
});
