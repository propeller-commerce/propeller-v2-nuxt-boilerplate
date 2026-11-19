import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-signed cookie values. Value: `<base64url payload>.<expiry unix s>.<base64url mac>`; the mac
 * covers a per-purpose label, so a cookie minted for one purpose never verifies as another, and the
 * expiry is checked server-side (a cookie's Max-Age is only the browser's promise).
 * Event-bound wrappers (secret from runtimeConfig): `server/utils/requestAuth.ts`.
 */

/** Label for the fallback key derived from the order-editor API key (never the API key itself). */
export const DERIVED_SECRET_LABEL = 'propeller-cookie-signing:v1';

/**
 * The signing secret: COOKIE_SIGNING_SECRET, else HMAC-SHA256(order-editor key, label) so existing
 * deployments keep working. '' when neither is set: signing is then off and nothing verifies.
 */
export function resolveCookieSecret(signingSecret: string, orderEditorKey: string): { secret: string; derived: boolean } {
  if (signingSecret) return { secret: signingSecret, derived: false };
  if (!orderEditorKey) return { secret: '', derived: false };
  return { secret: createHmac('sha256', orderEditorKey).update(DERIVED_SECRET_LABEL).digest('hex'), derived: true };
}

function mac(secret: string, purpose: string, body: string): Buffer {
  return createHmac('sha256', secret).update(`${purpose}\n${body}`).digest();
}

/** A signed value carrying `payload` for `purpose`, valid for `maxAgeSeconds`; '' without a secret. */
export function signCookieValue(
  secret: string,
  purpose: string,
  payload: string,
  maxAgeSeconds: number,
  now: number = Date.now(),
): string {
  if (!secret) return '';
  const body = `${Buffer.from(payload, 'utf8').toString('base64url')}.${Math.floor(now / 1000) + maxAgeSeconds}`;
  return `${body}.${mac(secret, purpose, body).toString('base64url')}`;
}

/** The payload when the value was signed for `purpose` with `secret` and has not expired, else null. */
export function verifyCookieValue(
  secret: string,
  purpose: string,
  value: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!secret || !value) return null;
  const match = /^([A-Za-z0-9_-]*)\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  const body = `${match[1]}.${match[2]}`;
  const given = Buffer.from(match[3]!, 'base64url');
  const expected = mac(secret, purpose, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(match[2]) * 1000 <= now) return null;
  return Buffer.from(match[1]!, 'base64url').toString('utf8');
}
