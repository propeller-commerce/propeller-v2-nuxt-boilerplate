import { checkTrackerAccess, isTrackerPath, TRACKER_AUTH_CHALLENGE } from '../utils/trackerAccess';

// Gates the /tracker page and every /api/tracker* route behind TRACKER_ACCESS_SECRET.
export default defineEventHandler((event) => {
  if (!isTrackerPath(event.path)) return;

  const config = useRuntimeConfig(event);
  const secret = String(config.trackerAccessSecret || process.env.TRACKER_ACCESS_SECRET || '');
  const access = checkTrackerAccess(secret, getHeader(event, 'authorization'));

  setResponseHeader(event, 'Cache-Control', 'no-store');
  if (access.allowed) return;

  if (access.status === 404) {
    throw createError({ statusCode: 404, statusMessage: 'Page Not Found' });
  }
  setResponseHeader(event, 'WWW-Authenticate', TRACKER_AUTH_CHALLENGE);
  setResponseStatus(event, 401);
  return { error: 'unauthorized' };
});
