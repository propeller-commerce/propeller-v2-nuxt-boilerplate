/**
 * POST /api/punchout/transfer — build the OCI/cXML payload, hand the cart back.
 *
 * Posted from the cart page with the cart id. Reads the authoritative cart with
 * the logged-in user's bearer (the magic-login `access_token` cookie), builds
 * the OCI NEW_ITEM field set or the cXML PunchOutOrderMessage per the punchout
 * session, deletes the shop cart, and returns a self-submitting form that POSTs
 * the payload back to the ERP.
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
  createAuthedClient,
  punchoutContext,
  isPunchoutDebug,
  CART_IMAGE_FILTERS,
  PUNCHOUT_MAPPINGS,
  PUNCHOUT_COOKIE,
  PUNCHOUT_FLAG_COOKIE,
} from '../../utils/punchout';

export default defineEventHandler(async (event) => {
  const rawSession = getCookie(event, PUNCHOUT_COOKIE);
  if (!rawSession) {
    setResponseStatus(event, 400);
    return 'No punchout session';
  }
  let session: {
    mode: 'oci' | 'cxml';
    returnUrl: string;
    target: string;
    session: Record<string, string>;
    buyerCookie?: string;
    from?: string;
    to?: string;
    deploymentMode?: string;
  };
  try {
    session = JSON.parse(rawSession);
  } catch {
    setResponseStatus(event, 400);
    return 'Bad punchout session';
  }
  if (!session.returnUrl) {
    setResponseStatus(event, 400);
    return 'No return URL';
  }

  const body = await readBody(event);
  const cartId = String(body?.cartId || '');
  if (!cartId) {
    setResponseStatus(event, 400);
    return 'Missing cartId';
  }

  const { currency, language } = punchoutContext(event);
  const client = createAuthedClient(event, getCookie(event, 'access_token'));
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
    console.error('[punchout] cart load failed:', err instanceof Error ? err.message : err);
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
    deleteCookie(event, PUNCHOUT_COOKIE, { path: '/' });
    deleteCookie(event, PUNCHOUT_FLAG_COOKIE, { path: '/' });
  }
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8');
  return html;
});
