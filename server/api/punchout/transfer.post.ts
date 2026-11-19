/**
 * POST /api/punchout/transfer — build the OCI/cXML payload, hand the cart back.
 *
 * Posted from the cart page with the cart id. Reads the authoritative cart with
 * the logged-in user's bearer (the magic-login `access_token` cookie), builds
 * the OCI NEW_ITEM field set or the cXML PunchOutOrderMessage per the punchout
 * session, deletes the shop cart, and returns a self-submitting form that POSTs
 * the payload back to the ERP.
 *
 * #20: same-origin form POST only; the session must be the signed one the
 * magic-token exchange activated for this very login (bound to the
 * access_token cookie); the return URL is re-checked (https, PUNCHOUT_HOOK_HOSTS)
 * before the cart is read or deleted, so a refused URL keeps the cart. This
 * response's CSP lets its form post to that one origin only.
 */

import { CartService } from '@propeller-commerce/propeller-sdk-v2';
import {
  buildOciFields,
  buildOrderCxml,
  buildAutoPostForm,
  buildDebugPage,
  type PunchoutContext,
  type PunchoutCart,
} from '@propeller-commerce/propeller-v2-punchout';
import {
  activePunchout,
  allowedHookUrl,
  clearPunchout,
  createAuthedClient,
  punchoutContext,
  isPunchoutDebug,
  CART_IMAGE_FILTERS,
  PUNCHOUT_MAPPINGS,
} from '../../utils/punchout';
import { requestBearer, sameOrigin } from '../../utils/requestAuth';
import { allowFormTarget } from '../../utils/securityHeaders';
import { errorSummary } from '../../utils/httpGuards';

export default defineEventHandler(async (event) => {
  if (!sameOrigin(event)) {
    setResponseStatus(event, 403);
    return 'Forbidden';
  }
  const session = activePunchout(event);
  if (!session) {
    setResponseStatus(event, 400);
    return 'No punchout session';
  }
  const hook = allowedHookUrl(event, session.returnUrl);
  if (!hook) {
    setResponseStatus(event, 400);
    return 'Invalid return URL';
  }

  const body = await readBody(event);
  const cartId = String(body?.cartId || '');
  if (!cartId) {
    setResponseStatus(event, 400);
    return 'Missing cartId';
  }

  const { currency, language } = punchoutContext(event);
  const client = createAuthedClient(event, requestBearer(event));
  const cartService = new CartService(client);

  let cart: PunchoutCart;
  try {
    cart = (await cartService.getCart({
      cartId,
      language,
      imageSearchFilters: CART_IMAGE_FILTERS.imageSearchFilters,
      imageVariantFilters: CART_IMAGE_FILTERS.imageVariantFilters,
    })) as unknown as PunchoutCart;
  } catch (err) {
    console.error('[punchout] cart load failed:', errorSummary(err));
    setResponseStatus(event, 502);
    return 'Could not load cart';
  }

  const ctx: PunchoutContext = {
    language,
    currency,
    session: session.session,
    buyerCookie: session.buyerCookie,
    from: session.from,
    to: session.to,
    deploymentMode: session.deploymentMode,
  };

  const debug = isPunchoutDebug(event);
  let html: string;
  if (session.mode === 'cxml') {
    const orderXml = buildOrderCxml(cart, ctx, PUNCHOUT_MAPPINGS.cxmlMapping);
    html = debug
      ? buildDebugPage({ mode: 'cxml', returnUrl: session.returnUrl, xml: orderXml, target: session.target })
      : buildAutoPostForm(session.returnUrl, { 'cxml-urlencoded': orderXml }, {
          target: session.target,
          submitLabel: 'Transfer cart to procurement',
        });
  } else {
    const fields = buildOciFields(cart, ctx, PUNCHOUT_MAPPINGS.ociMapping);
    html = debug
      ? buildDebugPage({ mode: 'oci', returnUrl: session.returnUrl, fields, target: session.target })
      : buildAutoPostForm(session.returnUrl, fields, {
          target: session.target,
          submitLabel: 'Transfer cart to procurement',
        });
  }

  // In debug mode keep the cart + session so the preview is re-runnable. In a
  // real transfer, delete the shop cart (items live in the ERP now) and clear
  // the punchout cookies.
  if (!debug) {
    try {
      await cartService.deleteCart({ id: cartId });
    } catch {
      /* non-fatal: the ERP already has the payload */
    }
    clearPunchout(event);
  }
  const csp = getResponseHeader(event, 'content-security-policy');
  if (typeof csp === 'string') setResponseHeader(event, 'content-security-policy', allowFormTarget(csp, hook.origin));
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
  return html;
});
