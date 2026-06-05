/**
 * POST /api/revalidate — surgical cache invalidation entry point.
 *
 * Same webhook contract as propeller-next:
 *   Header: X-Revalidate-Secret: <REVALIDATE_SECRET>
 *   Body:   { "tag": "product:42" }   // or 'category:13', 'menu', 'catalog', '*'
 *   200    { ok: true, tag: '<input>', cleared: <number> }
 *   400    { error: 'missing tag' | 'invalid JSON' }
 *   401    { error: 'unauthorized' }
 *   503    { error: 'revalidation endpoint not configured' }
 *
 * The `*` shorthand busts every entry under TAG_CATALOG (every anonymous
 * fetcher attaches it as an umbrella tag).
 */

import { bustTag } from '../utils/cache';
import { TAG_CATALOG } from '../utils/tags';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const expected = config.revalidateSecret;

  if (!expected) {
    setResponseStatus(event, 503);
    return { error: 'revalidation endpoint not configured' };
  }

  const provided = getHeader(event, 'x-revalidate-secret');
  if (provided !== expected) {
    setResponseStatus(event, 401);
    return { error: 'unauthorized' };
  }

  let body: unknown;
  try {
    body = await readBody(event);
  } catch {
    setResponseStatus(event, 400);
    return { error: 'invalid JSON' };
  }

  const tag =
    body && typeof body === 'object' && 'tag' in body && typeof (body as { tag: unknown }).tag === 'string'
      ? (body as { tag: string }).tag
      : null;

  if (!tag) {
    setResponseStatus(event, 400);
    return { error: 'missing tag' };
  }

  try {
    const effective = tag === '*' ? TAG_CATALOG : tag;
    const cleared = await bustTag(effective);
    return { ok: true, tag, cleared };
  } catch (e) {
    setResponseStatus(event, 500);
    return { error: e instanceof Error ? e.message : 'revalidation failed' };
  }
});
