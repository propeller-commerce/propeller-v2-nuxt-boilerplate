import { getAnonymousInfra } from '../../utils/infra';
import { resolveAnonymousUserId } from '../../utils/fetchers';

/**
 * The channel-derived defaults the BROWSER needs. Only the anonymous user id so
 * far: client-side listing queries must scope to the same user the SSR seed
 * did, or the refetch quietly replaces a correctly-scoped list with a
 * differently-scoped one (PWP-942 #22).
 *
 * Server-only knowledge — the channel query needs the api key — so it is
 * fetched once during SSR and carried to the client in the Nuxt payload.
 */
export default defineEventHandler(async (event) => {
  const infra = getAnonymousInfra(event);
  return { anonymousUserId: await resolveAnonymousUserId(infra) };
});
