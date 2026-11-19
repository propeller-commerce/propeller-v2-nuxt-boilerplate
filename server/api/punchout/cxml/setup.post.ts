/**
 * POST /api/punchout/cxml/setup — inbound cXML PunchOutSetupRequest.
 *
 * The Nitro mirror of propeller-next's app/api/punchout/cxml/setup and
 * propeller-vue's Express `/api/punchout/cxml/setup`. Validates the shared
 * secret, mints a one-time magic token (admin key), and replies with a
 * PunchOutSetupResponse whose StartPage is our `/api/punchout/enter` link.
 *
 * The BrowserFormPost (https, PUNCHOUT_HOOK_HOSTS when set) and the echo values
 * travel to `enter` sealed in the StartPage (`setup`, bound to the minted
 * token), so nobody can swap the return address in the link (#20).
 */

import {
  parseSetupRequest,
  buildSetupResponse,
  buildErrorResponse,
  buildStartUrl,
} from '@propeller-commerce/propeller-v2-punchout';
import {
  allowedHookUrl,
  isPunchoutEnabled,
  punchoutContext,
  resolveCxmlBuyer,
  createPunchoutMagicToken,
} from '../../../utils/punchout';
import { PURPOSE, SETUP_MAX_AGE, sealPunchout } from '../../../utils/punchoutSession';
import { cookieSigningSecret } from '../../../utils/requestAuth';
import { errorSummary } from '../../../utils/httpGuards';

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
  const hook = allowedHookUrl(event, parsed.browserFormPostUrl);
  if (!hook) {
    return sendXml(buildErrorResponse(400, 'BrowserFormPost URL not allowed'), 400);
  }

  let mtoken: string;
  try {
    mtoken = await createPunchoutMagicToken(event, buyer.contactId);
  } catch (err) {
    console.error('[punchout] token mint failed:', errorSummary(err));
    return sendXml(buildErrorResponse(500, 'Could not start punchout session'), 500);
  }

  const setup = sealPunchout(
    cookieSigningSecret(event),
    PURPOSE.setup,
    {
      mode: 'cxml',
      returnUrl: hook.href,
      target: punchoutContext(event).transferTarget,
      session: {},
      buyerCookie: parsed.buyerCookie || undefined,
      from: parsed.fromIdentity || undefined,
      to: parsed.toIdentity || undefined,
      deploymentMode: parsed.deploymentMode || 'test',
    },
    mtoken,
    SETUP_MAX_AGE,
  );
  if (!setup) {
    console.error('[punchout] no cookie signing secret (COOKIE_SIGNING_SECRET or the order-editor key)');
    return sendXml(buildErrorResponse(500, 'Could not start punchout session'), 500);
  }

  const origin = getRequestURL(event).origin;
  const startUrl = buildStartUrl(`${origin}/api/punchout/enter`, { mode: 'cxml', mtoken, redirect: '/cart', setup });

  return sendXml(buildSetupResponse({ startUrl }), 200);
});
