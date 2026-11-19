/**
 * GET /api/punchout/enter — open a punchout session, redirect to magic-login.
 *
 * The URL the ERP opens (OCI) or the cXML StartPage points at. It does NOT
 * activate anything by itself (#20): it stores the session (return address +
 * OCI params / cXML echo values) in a signed, 10-minute `punchout_pending`
 * cookie bound to sha256(mtoken), and redirects into the magic-login flow. Only
 * a successful magicTokenLogin of that same token (seen by /api/graphql)
 * promotes it to the signed `punchout` session and the `punchout_active` flag
 * the cart page reads; a failed exchange clears it.
 *
 * - OCI: the return address is the `HOOK_URL` query parameter (https only, and
 *   in PUNCHOUT_HOOK_HOSTS when that is set), checked here and again at transfer.
 * - cXML: the BrowserFormPost and echo values come sealed from the
 *   shared-secret-authenticated setup (`setup`, bound to the minted token);
 *   loose query parameters are ignored.
 *
 * Logging in from a GET link is how punchout works (N2): whoever holds a valid
 * magic token is logged in as its contact. See README "PunchOut".
 */

import { mapOciParams } from '@propeller-commerce/propeller-v2-punchout';
import { localPath } from '../../../app/lib/localPath';
import { allowedHookUrl, isPunchoutEnabled, punchoutContext, setPendingPunchout } from '../../utils/punchout';
import { openPunchout, PURPOSE, type PunchoutSession } from '../../utils/punchoutSession';
import { cookieSigningSecret } from '../../utils/requestAuth';

export default defineEventHandler(async (event) => {
  if (!isPunchoutEnabled(event)) {
    setResponseStatus(event, 404);
    return 'PunchOut disabled';
  }

  const q = getQuery(event);
  const mtoken = typeof q.mtoken === 'string' ? q.mtoken : '';
  if (!mtoken) {
    setResponseStatus(event, 400);
    return 'Missing mtoken';
  }

  const session: PunchoutSession | null =
    q.mode === 'cxml'
      ? openPunchout(cookieSigningSecret(event), PURPOSE.setup, typeof q.setup === 'string' ? q.setup : '', mtoken)
      : {
          mode: 'oci',
          returnUrl: String(q.HOOK_URL || q.hook_url || q.returnUrl || ''),
          target: punchoutContext(event).transferTarget,
          session: mapOciParams(q as Record<string, string>),
        };
  if (!session) {
    setResponseStatus(event, 400);
    return 'Invalid punchout start link';
  }
  if (!allowedHookUrl(event, session.returnUrl)) {
    setResponseStatus(event, 400);
    return 'Invalid return URL';
  }
  if (!setPendingPunchout(event, session, mtoken)) {
    console.error('[punchout] no cookie signing secret (COOKIE_SIGNING_SECRET or the order-editor key)');
    setResponseStatus(event, 503);
    return 'PunchOut not configured';
  }

  // Same-site paths only (#14).
  const redirect = localPath(q.redirect) || '/cart';
  const target = `/magic-login?mtoken=${encodeURIComponent(mtoken)}&redirect=${encodeURIComponent(redirect)}`;
  return sendRedirect(event, target, 302);
});
