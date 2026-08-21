/**
 * DELETE /api/auth/session — clear auth cookies on logout.
 */

export default defineEventHandler((event) => {
  deleteCookie(event, 'access_token', { path: '/' });
  deleteCookie(event, 'refresh_token', { path: '/' });
  return { ok: true };
});
