/**
 * POST /api/auth/session — write the httpOnly access_token cookie after a
 * successful login/register. The client posts the JWT here; the cookie
 * carries it on subsequent SSR requests so server fetchers render
 * personalised HTML without the token ever touching localStorage.
 *
 * Mirrored from propeller-next's app/api/auth/session/route.ts.
 */

interface SessionBody {
  accessToken?: string;
  refreshToken?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SessionBody>(event);
  const accessToken = body?.accessToken;
  const refreshToken = body?.refreshToken;

  if (!accessToken) {
    setResponseStatus(event, 400);
    return { error: 'missing accessToken' };
  }

  const secure = getRequestProtocol(event) === 'https';

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
