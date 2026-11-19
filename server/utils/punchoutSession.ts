import { createHash } from 'node:crypto';
import { Kind } from 'graphql';
import type { SingleField } from './orderEditorRouting.ts';
import { signCookieValue, verifyCookieValue } from './signedCookie.ts';

/**
 * PunchOut session binding (#20, N2). A punchout session is only ever activated by a successful
 * magic-token exchange of the token it was opened with:
 *
 *   enter (GET, OCI or cXML)  →  `punchout_pending`, sealed and bound to sha256(mtoken), 10 min
 *   magicTokenLogin succeeds through /api/graphql for that token
 *                             →  `punchout` (active), sealed and bound to sha256(the new access token),
 *                                plus the readable `punchout_active` flag for the cart page
 *   a failed or different magic login, a password login or logout clears them.
 *
 * cXML's BrowserFormPost travels from the shared-secret-authenticated setup to `enter` sealed in
 * the start URL (`setup`, bound to the minted token), never as a plain query parameter.
 * Event-bound cookie handling: `server/utils/punchout.ts`.
 */

export const PUNCHOUT_COOKIE = 'punchout';
export const PUNCHOUT_FLAG_COOKIE = 'punchout_active';
export const PUNCHOUT_PENDING_COOKIE = 'punchout_pending';

export const PUNCHOUT_MAX_AGE = 60 * 60;
export const PENDING_MAX_AGE = 10 * 60;
export const SETUP_MAX_AGE = 60 * 60;

export const PURPOSE = { pending: 'punchout-pending', active: 'punchout', setup: 'punchout-setup' } as const;

export interface PunchoutSession {
  mode: 'oci' | 'cxml';
  returnUrl: string;
  target: string;
  session: Record<string, string>;
  buyerCookie?: string;
  from?: string;
  to?: string;
  deploymentMode?: string;
}

export const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * The procurement system's return URL when it may receive a cart: https only, and when
 * PUNCHOUT_HOOK_HOSTS is set (comma-separated host names), one of those hosts. Else null.
 */
export function hookUrl(raw: unknown, allowedHosts: string): URL | null {
  if (typeof raw !== 'string' || !raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const hosts = allowedHosts
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length && !hosts.includes(url.hostname.toLowerCase()) ? null : url;
}

/** `session` sealed for `purpose`, bound to `bindTo` (stored as its sha256 only). */
export function sealPunchout(
  secret: string,
  purpose: string,
  session: PunchoutSession,
  bindTo: string,
  maxAgeSeconds: number,
  now?: number,
): string {
  return signCookieValue(secret, purpose, JSON.stringify({ b: sha256(bindTo), s: session }), maxAgeSeconds, now);
}

/** The session when `value` was sealed for `purpose` and bound to `bindTo`, unexpired; else null. */
export function openPunchout(
  secret: string,
  purpose: string,
  value: string | null | undefined,
  bindTo: string | null | undefined,
  now?: number,
): PunchoutSession | null {
  if (!bindTo) return null;
  const payload = verifyCookieValue(secret, purpose, value, now);
  if (!payload) return null;
  try {
    const { b, s } = JSON.parse(payload) as { b?: unknown; s?: PunchoutSession };
    return b === sha256(bindTo) && s && typeof s.returnUrl === 'string' ? s : null;
  } catch {
    return null;
  }
}

/**
 * A relayed `magicTokenLogin(id)` mutation: the token it exchanged and the access token upstream
 * answered with (null when the exchange failed). Null for any other operation.
 */
export function magicTokenExchange(
  single: SingleField | null,
  variables: unknown,
  response: unknown,
): { token: string; accessToken: string | null } | null {
  if (!single || single.operation !== 'mutation' || single.field.name.value !== 'magicTokenLogin') return null;
  const arg = single.field.arguments?.find((a) => a.name.value === 'id')?.value;
  let token: unknown;
  if (arg?.kind === Kind.STRING) token = arg.value;
  else if (arg?.kind === Kind.VARIABLE && variables && typeof variables === 'object') {
    token = (variables as Record<string, unknown>)[arg.name.value];
  }
  if (typeof token !== 'string' || !token) return null;
  const data = (response as { data?: Record<string, unknown> } | null)?.data;
  const result = data?.[single.field.alias?.value ?? 'magicTokenLogin'] as
    | { session?: { accessToken?: unknown } | null }
    | null
    | undefined;
  const accessToken = result?.session?.accessToken;
  return { token, accessToken: typeof accessToken === 'string' && accessToken ? accessToken : null };
}
