/**
 * POST /api/auth/session — write the httpOnly access_token cookie after a
 * successful login/register. The client posts the JWT here; the cookie
 * carries it on subsequent SSR requests so server fetchers render
 * personalised HTML without the token ever touching localStorage.
 *
 * Same-origin JSON only (#8): otherwise another site could post its own
 * token here and log the visitor into the attacker's account (login CSRF).
 *
 * A new session ends any punchout session that wasn't activated for this very
 * token by its magic-token exchange (#20): a password login never inherits one.
 *
 * Mirrored from propeller-next's app/api/auth/session/route.ts.
 */

import { sameOrigin, secureCookie } from '../../utils/requestAuth';
import { activePunchout, clearPunchout } from '../../utils/punchout';

interface SessionBody {
  accessToken?: string;
  refreshToken?: string;
}

export default defineEventHandler(async (event) => {
  if (!sameOrigin(event, { json: true })) {
    setResponseStatus(event, 403);
    return { error: 'forbidden' };
  }

  const body = await readBody<SessionBody>(event).catch(() => null);
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';
  const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : '';

  if (!accessToken) {
    setResponseStatus(event, 400);
    return { error: 'missing accessToken' };
  }

  if (!activePunchout(event, accessToken)) clearPunchout(event);

  const secure = secureCookie(event);

  setCookie(event, 'access_token', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });

  if (refreshToken) {
    setCookie(event, 'refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return { ok: true };
});
