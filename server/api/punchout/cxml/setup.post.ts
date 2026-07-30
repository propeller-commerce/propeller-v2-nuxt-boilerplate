/**
 * POST /api/punchout/cxml/setup — inbound cXML PunchOutSetupRequest.
 *
 * The Nitro mirror of propeller-next's app/api/punchout/cxml/setup and
 * propeller-vue's Express `/api/punchout/cxml/setup`. Validates the shared
 * secret, mints a reusable magic token (admin key), and replies with a
 * PunchOutSetupResponse whose StartPage is our `/api/punchout/enter` link.
 */

import {
  parseSetupRequest,
  buildSetupResponse,
  buildErrorResponse,
  buildStartUrl,
} from '@propeller-commerce/propeller-v2-punchout';
import {
  isPunchoutEnabled,
  resolveCxmlBuyer,
  createPunchoutMagicToken,
} from '../../../utils/punchout';

export default defineEventHandler(async (event) => {
  const sendXml = (body: string, status: number) => {
    setResponseStatus(event, status);
    setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8');
    return body;
  };

  if (!isPunchoutEnabled(event)) return sendXml(buildErrorResponse(403, 'PunchOut disabled'), 403);

  const raw = await readRawBody(event);
  let parsed;
  try {
    parsed = parseSetupRequest(typeof raw === 'string' ? raw : raw?.toString('utf8') || '');
  } catch {
    return sendXml(buildErrorResponse(400, 'Malformed cXML'), 400);
  }

  const buyer = await resolveCxmlBuyer(event, parsed.sharedSecret || '');
  if (!buyer) {
    return sendXml(buildErrorResponse(401, 'Invalid credentials'), 401);
  }

  let mtoken: string;
  try {
    mtoken = await createPunchoutMagicToken(event, buyer.contactId);
  } catch (err) {
    console.error('[punchout] token mint failed:', err instanceof Error ? err.message : err);
    return sendXml(buildErrorResponse(500, 'Could not start punchout session'), 500);
  }

  const origin = getRequestURL(event).origin;
  const startUrl = buildStartUrl(`${origin}/api/punchout/enter`, {
    mode: 'cxml',
    mtoken,
    redirect: '/cart',
    HOOK_URL: parsed.browserFormPostUrl,
    buyer_cookie: parsed.buyerCookie,
    cxml_from: parsed.fromIdentity,
    cxml_to: parsed.toIdentity,
    deployment_mode: parsed.deploymentMode,
  });

  return sendXml(buildSetupResponse({ startUrl }), 200);
});
