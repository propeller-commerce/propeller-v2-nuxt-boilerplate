/**
 * DELETE /api/auth/session — clear auth cookies on logout, and with them what the
 * session left in this browser: the last order it placed (which unlocks that
 * order's thank-you page and payment), the company it just registered and the
 * punchout session (#20), so the next person on a shared browser inherits none
 * of it. A cross-site DELETE already needs a preflight; the Origin check makes
 * that explicit.
 */

import { sameOrigin } from '../../utils/requestAuth';
import { clearPunchout } from '../../utils/punchout';
import { LAST_ORDER_COOKIE } from '../../utils/orderEditorRouting';
import { REGISTRATION_COOKIE } from '../../utils/registrationRouting';

export default defineEventHandler((event) => {
  if (!sameOrigin(event)) {
    setResponseStatus(event, 403);
    return { error: 'forbidden' };
  }
  for (const name of ['access_token', 'refresh_token', LAST_ORDER_COOKIE, REGISTRATION_COOKIE]) {
    deleteCookie(event, name, { path: '/' });
  }
  // `?keep=punchout-pending`: magic-login, right before the token exchange that activates the
  // pending punchout entry. Any other logout clears it too.
  clearPunchout(event, { pending: getQuery(event).keep !== 'punchout-pending' });
  return { ok: true };
});
