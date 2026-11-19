/** Fixed-window in-memory rate limiter, keyed by `<route>:<client ip>`; per server process. */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfter: number };

export interface RateLimiter {
  hit(key: string, rule: RateLimitRule): RateLimitResult;
  size(): number;
}

export const PRICE_REQUEST_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 10 * 60 * 1000 };

/** Confirmation mails to one address, whatever IP or account the requests come from (#10). */
export const CONFIRMATION_DAILY_CAP: RateLimitRule = { limit: 3, windowMs: 24 * 60 * 60 * 1000 };

/** Limiter key for the per-recipient cap: case and surrounding space don't make a new address. */
export function recipientCapKey(route: string, email: string): string {
  return `${route}:to:${email.trim().toLowerCase()}`;
}

// Hard cap so spoofed IPs cannot grow the map without bound.
const MAX_ENTRIES = 10_000;

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = Infinity;

  function sweep(t: number): void {
    nextSweep = Infinity;
    for (const [key, entry] of entries) {
      if (entry.resetAt <= t) entries.delete(key);
      else if (entry.resetAt < nextSweep) nextSweep = entry.resetAt;
    }
  }

  return {
    hit(key, rule) {
      const t = now();
      if (t >= nextSweep) sweep(t);

      let entry = entries.get(key);
      if (!entry || entry.resetAt <= t) {
        if (entries.size >= MAX_ENTRIES) {
          const oldest = entries.keys().next().value;
          if (oldest !== undefined) entries.delete(oldest);
        }
        entry = { count: 0, resetAt: t + rule.windowMs };
        entries.delete(key);
        entries.set(key, entry);
        if (entry.resetAt < nextSweep) nextSweep = entry.resetAt;
      }

      entry.count += 1;
      if (entry.count <= rule.limit) return { allowed: true };
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
    },
    size: () => entries.size,
  };
}

/** Process-wide limiter shared by the public form endpoints. */
export const formRateLimiter: RateLimiter = createRateLimiter();
