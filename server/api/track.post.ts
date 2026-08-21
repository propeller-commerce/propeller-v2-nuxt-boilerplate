import crypto from 'node:crypto';
import { EVENT_NAME_SET } from '../../app/lib/tracking/taxonomy';
import { getTrackingPool } from '../utils/trackingDb';

/**
 * Behaviour-event ingest.
 *
 * Public by nature — called from the browser on every page — so everything that
 * decides WHO an event belongs to is derived server-side; the body is treated as
 * untrusted payload detail only. Without that the table fills with data
 * indistinguishable from real activity, and the first chart built on it is wrong.
 *
 * Imports the taxonomy from `app/lib/` rather than duplicating it: Nitro compiles
 * server code with the same TypeScript pipeline, so unlike propeller-vue — whose
 * `server.js` bypasses Vite entirely — there is one allowlist and no drift risk.
 */

const MAX_EVENTS = 50;
const MAX_BODY_BYTES = 128 * 1024;
/** How far a client clock may be off before we stop believing it. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const VISITOR_COOKIE = 'pr_vid';
const VISITOR_MAX_AGE = 365 * 24 * 60 * 60;

type Json = Record<string, unknown>;

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string' || v.length === 0) return null;
  return v.length > max ? v.slice(0, max) : v;
};

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const uuid = (v: unknown): string | null => {
  const s = str(v, 36);
  return s && /^[0-9a-fA-F-]{36}$/.test(s) ? s : null;
};

const USER_MODES = new Set(['anonymous', 'b2c', 'b2b']);

/** Columns promoted out of `props`; whatever is left is stored as JSON. */
const PROMOTED = new Set([
  'page_type', 'entity_type', 'entity_id', 'entity_name',
  'search_term', 'results_count', 'query_id',
  'product_id', 'sku', 'order_id', 'quantity', 'value',
  'source',
]);

export default defineEventHandler(async (event) => {
  // 202 regardless, and early: the caller is a fire-and-forget beacon, and a
  // storefront must not care whether analytics is configured or healthy.
  setResponseStatus(event, 202);

  try {
    const pool = getTrackingPool();
    if (!pool) return null;

    // Read raw: sendBeacon posts text/plain, and it is the only transport that
    // survives the PSP redirect and tab close. `readBody` would parse by
    // content-type and hand back a string for exactly that case, so parse here.
    const raw = await readRawBody(event, 'utf8');
    if (typeof raw !== 'string' || raw.length > MAX_BODY_BYTES) return null;

    const body = JSON.parse(raw) as { context?: Json; events?: Json[] };
    const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
    const ctx = (body.context ?? {}) as Json;

    // Identity resolved here, never taken from the body: the channel is ours and
    // the visitor id comes from the cookie, so a client cannot claim to be
    // someone else's visitor.
    const cookieVisitor = uuid(getCookie(event, VISITOR_COOKIE));
    const visitorId = cookieVisitor ?? crypto.randomUUID();
    if (!cookieVisitor) {
      // Minted here rather than during SSR: a Set-Cookie on an HTML response
      // makes it uncacheable, and this app has real page-cache infrastructure
      // (server/utils/cache.ts) to protect.
      setCookie(event, VISITOR_COOKIE, visitorId, {
        path: '/', maxAge: VISITOR_MAX_AGE, sameSite: 'lax',
      });
    }
    if (events.length === 0) return null;

    const config = useRuntimeConfig(event);
    const channelId = Number(config.public?.channelId) || 1;

    const sessionId = uuid(ctx.sessionId) ?? visitorId;
    const userMode = USER_MODES.has(String(ctx.userMode)) ? String(ctx.userMode) : 'anonymous';
    const contactId = num(ctx.contactId);
    const customerId = num(ctx.customerId);
    const companyId = num(ctx.companyId);
    const language = str(ctx.language, 2);
    const currency = str(ctx.currency, 3);

    const now = Date.now();
    const rows: unknown[][] = [];

    for (const e of events) {
      const name = str(e.name, 64);
      // Unknown names are dropped rather than stored: an open endpoint plus a
      // free-form name column is how an events table becomes unqueryable.
      if (!name || !EVENT_NAME_SET.has(name)) continue;

      // Clamp the client clock. Every index and the partitioning are built on
      // occurred_at, so it has to be the one trustworthy axis.
      const clientTs = num(e.ts) ?? now;
      const ts = Math.abs(now - clientTs) > MAX_CLOCK_SKEW_MS ? now : clientTs;

      const props = (e.props ?? {}) as Json;
      const source = (props.source ?? {}) as Json;

      const key = str(e.key, 191) ?? `${name}:${ts}`;
      const idem = crypto.createHash('md5').update(`${visitorId}|${key}`).digest();

      const rest: Json = {};
      for (const [k, v] of Object.entries(props)) if (!PROMOTED.has(k)) rest[k] = v;

      rows.push([
        new Date(ts), channelId, name, visitorId, sessionId, userMode,
        contactId, customerId, companyId, language, currency,
        str(props.page_type, 32), str(props.entity_type, 32), num(props.entity_id), str(props.entity_name, 255),
        str(source.type, 32), num(source.id), num(source.position),
        str(props.search_term ?? source.searchTerm, 255), num(props.results_count),
        uuid(props.query_id ?? source.queryId),
        num(props.product_id), str(props.sku, 64), num(props.order_id), num(props.quantity), num(props.value),
        idem,
        Object.keys(rest).length > 0 ? JSON.stringify(rest) : null,
      ]);
    }

    if (rows.length === 0) return null;

    // INSERT IGNORE, not INSERT: uq_idem means a single replayed row would
    // otherwise reject the whole batch.
    await pool.query(
      `INSERT IGNORE INTO storefront_events
         (occurred_at, channel_id, event_name, visitor_id, session_id, user_mode,
          contact_id, customer_id, company_id, language, currency,
          page_type, entity_type, entity_id, entity_name,
          source_type, source_id, source_position,
          search_term, results_count, query_id,
          product_id, sku, order_id, quantity, value,
          idempotency_key, props)
       VALUES ?`,
      [rows]
    );
  } catch (error) {
    // Never surface an error: a failed batch is dropped by design.
    console.error('[track] ingest failed:', error instanceof Error ? error.message : error);
  }

  return null;
});
