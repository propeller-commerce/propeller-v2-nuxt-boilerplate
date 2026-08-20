import { classifyDbError, isTrackingConfigured, STATUS_HINTS, todayLocal, addDays } from '../../utils/trackingDb';
import {
  TRACKER_METRICS,
  TRACKER_MAX_LIMIT,
  TRACKER_MAX_RANGE_DAYS,
  type MetricParams,
} from '../../utils/trackingQueries';

/**
 * Dashboard metrics endpoint (PWP-910).
 *
 * `metric` selects a static named query from an allowlist — it is never
 * interpolated into SQL. `from`/`to`/`limit` are validated, clamped and passed
 * as bound parameters.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const metric = String(query.metric ?? '');

  const runner = TRACKER_METRICS[metric];
  if (!runner) {
    setResponseStatus(event, 400);
    return { error: 'unknown metric', allowed: Object.keys(TRACKER_METRICS) };
  }

  const today = todayLocal();
  const from = String(query.from ?? today);
  const to = String(query.to ?? today);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    setResponseStatus(event, 400);
    return { error: 'from/to must be YYYY-MM-DD' };
  }

  const span = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
  if (!Number.isFinite(span) || span < 0) {
    setResponseStatus(event, 400);
    return { error: 'to must not precede from' };
  }

  // Answered before running anything: with no database every metric would
  // otherwise return an empty array with a 200, and a dashboard full of honest
  // zeros is indistinguishable from a quiet day.
  if (!isTrackingConfigured()) {
    setResponseStatus(event, 503);
    return {
      error: 'analytics database not configured',
      status: 'not_configured',
      hint: STATUS_HINTS.not_configured,
      metric,
    };
  }

  // Capped so a hand-edited or bookmarked URL cannot ask for a decade.
  const safeTo = span > TRACKER_MAX_RANGE_DAYS ? addDays(from, TRACKER_MAX_RANGE_DAYS) : to;
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), TRACKER_MAX_LIMIT);

  const config = useRuntimeConfig(event);
  const params: MetricParams = {
    from,
    to: safeTo,
    limit,
    channelId: Number(config.public?.channelId) || 1,
  };

  try {
    const data = await runner(params);
    // Always fresh: the dashboard polls for near-real-time numbers, so a cached
    // response would quietly show stale data that looks live.
    setResponseHeader(event, 'Cache-Control', 'no-store');
    return { metric, from, to: safeTo, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'query failed';
    // A setup problem is not a server fault: 503 with the fix attached, so the
    // dashboard can say "run tracking:init" instead of relaying ER_NO_SUCH_TABLE.
    const status = classifyDbError(error);
    if (status) {
      setResponseStatus(event, 503);
      return { error: message, status, hint: STATUS_HINTS[status], metric };
    }
    console.error('[tracker] query failed:', message);
    setResponseStatus(event, 500);
    return { error: message, metric };
  }
});
