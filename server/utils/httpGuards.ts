import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Small request guards shared by the server routes. Pure (no h3), so they are unit-tested directly;
 * the event-bound `sameOrigin(event)` lives in `server/utils/requestAuth.ts`.
 */

/** Constant-time string compare (on fixed-length digests) for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

export interface OriginHeaders {
  origin?: string | null;
  host?: string | null;
  forwardedHost?: string | null;
  contentType?: string | null;
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * A request whose Origin, when sent, is the shop's own host: x-forwarded-host or Host, or the
 * configured site URL (for a reverse proxy that forwards Host as localhost). Browsers send Origin on
 * every POST/DELETE; without one it is a non-browser client, which carries no visitor's cookies.
 */
export function isSameOrigin(h: OriginHeaders, siteUrl?: string): boolean {
  if (!h.origin) return true;
  const originHost = hostOf(h.origin);
  if (!originHost) return false;
  const allowed = [
    (h.forwardedHost || '').split(',')[0]!.trim().toLowerCase(),
    (h.host || '').trim().toLowerCase(),
    siteUrl ? hostOf(siteUrl) : null,
  ].filter(Boolean);
  return allowed.includes(originHost);
}

/**
 * A JSON request from the shop itself. A cross-site HTML form can't send application/json (that
 * needs a CORS preflight this app never answers), and the Origin must pass `isSameOrigin`.
 */
export function isSameOriginJson(h: OriginHeaders, siteUrl?: string): boolean {
  const type = (h.contentType || '').split(';')[0]!.trim().toLowerCase();
  return type === 'application/json' && isSameOrigin(h, siteUrl);
}

/**
 * What to log about a mail or upstream failure: the error type and codes only. Messages and SMTP
 * responses quote recipient addresses, which must not reach the logs.
 */
export function errorSummary(e: unknown): Record<string, string | number> {
  if (e === null) return { name: 'null' };
  if (!(e instanceof Error)) return { name: typeof e };
  const out: Record<string, string | number> = { name: e.name };
  const extra = e as unknown as Record<string, unknown>;
  for (const key of ['code', 'responseCode', 'command', 'status', 'statusCode']) {
    const v = extra[key];
    if (typeof v === 'string' || typeof v === 'number') out[key] = v;
  }
  return out;
}

/** An access_token cookie value that can be a token (trimmed, no whitespace in it), else undefined. */
export function cookieToken(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  return value && !/\s/.test(value) ? value : undefined;
}
