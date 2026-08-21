/**
 * GET /api/punchout/enter — capture the punchout session, redirect to magic-login.
 *
 * The URL the ERP opens (OCI) or the cXML StartPage points at. Stores the
 * session (return address + OCI params / cXML echo credentials) in an httpOnly
 * cookie, drops a readable flag cookie for the cart page's transfer button, then
 * redirects into the existing magic-login flow. The `punchout` cookie is
 * separate from the auth cookies, so it survives magic-login's session clear.
 */

import { mapOciParams } from '@propeller-commerce/propeller-v2-punchout';
import {
  isPunchoutEnabled,
  punchoutContext,
  PUNCHOUT_COOKIE,
  PUNCHOUT_FLAG_COOKIE,
} from '../../utils/punchout';

export default defineEventHandler(async (event) => {
  if (!isPunchoutEnabled(event)) {
    setResponseStatus(event, 404);
    return 'PunchOut disabled';
  }

  const q = getQuery(event);
  const mtoken = String(q.mtoken || '');
  if (!mtoken) {
    setResponseStatus(event, 400);
    return 'Missing mtoken';
  }

  const { transferTarget } = punchoutContext(event);
  const mode = q.mode === 'cxml' ? 'cxml' : 'oci';
  const returnUrl = String(q.HOOK_URL || q.hook_url || q.returnUrl || '');

  const session =
    mode === 'oci'
      ? { mode, returnUrl, target: transferTarget, session: mapOciParams(q as Record<string, string>) }
      : {
          mode,
          returnUrl,
          target: transferTarget,
          session: {},
          buyerCookie: q.buyer_cookie ? String(q.buyer_cookie) : undefined,
          from: q.cxml_from ? String(q.cxml_from) : undefined,
          to: q.cxml_to ? String(q.cxml_to) : undefined,
          deploymentMode: String(q.deployment_mode || 'test'),
        };

  const isProd = process.env.NODE_ENV === 'production';
  const base = { path: '/', sameSite: 'lax' as const, secure: isProd, maxAge: 3600 };
  setCookie(event, PUNCHOUT_COOKIE, JSON.stringify(session), { ...base, httpOnly: true });
  setCookie(event, PUNCHOUT_FLAG_COOKIE, mode, { ...base, httpOnly: false });

  const redirect = String(q.redirect || '/cart');
  const target = `/magic-login?mtoken=${encodeURIComponent(mtoken)}&redirect=${encodeURIComponent(redirect)}`;
  return sendRedirect(event, target, 302);
});
