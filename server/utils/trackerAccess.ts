import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Basic-auth gate for the /tracker dashboard and its /api/tracker* data. */

export const TRACKER_AUTH_CHALLENGE = 'Basic realm="tracker", charset="UTF-8"';

export type TrackerAccess = { allowed: true } | { allowed: false; status: 401 | 404 };

const PAGE_PATH = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/tracker(?:\/|$)/;
const API_PATH = /^\/api\/tracker/;

function normalisePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Keep the raw path; an undecodable one still gets matched as written.
  }
  return decoded.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
}

/** True for the dashboard page (any locale prefix, any sub-path) and every tracker API route. */
export function isTrackerPath(path: string): boolean {
  const p = normalisePath(path);
  return PAGE_PATH.test(p) || API_PATH.test(p);
}

function basicPassword(header: string | undefined): string | null {
  if (typeof header !== 'string') return null;
  const match = /^basic +([a-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1]!, 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  return colon < 0 ? null : decoded.slice(colon + 1);
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** Unset secret → 404 (fail closed); bad or missing credentials → 401; any username. */
export function checkTrackerAccess(secret: string | undefined, authorization: string | undefined): TrackerAccess {
  if (!secret || !secret.trim()) return { allowed: false, status: 404 };
  const password = basicPassword(authorization);
  if (password === null || !safeEqual(password, secret)) return { allowed: false, status: 401 };
  return { allowed: true };
}
