/**
 * Request-bound session helpers shared by the server routes: the verified viewer behind a Bearer,
 * signed cookies and the client IP. The logic lives in pure, tested modules (viewer.ts,
 * signedCookie.ts, clientIp.ts); this file only binds them to runtimeConfig and the event.
 */

import type { H3Event } from 'h3';
import { getCookie, getHeader, getRequestProtocol } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { clientIpFrom } from './clientIp';
import { cookieToken, isSameOrigin, isSameOriginJson } from './httpGuards';
import { resolveCookieSecret, signCookieValue, verifyCookieValue } from './signedCookie';
import { createViewerLookup, parseViewer, VIEWER_QUERY, type Viewer, type ViewerLookup } from './viewer';

let derivedWarned = false;

/**
 * The HMAC secret for signed cookies: COOKIE_SIGNING_SECRET, else one derived from the order-editor
 * key (warned once). '' when neither is set: signCookie returns '' and verifyCookie null. Read from
 * the runtime environment first: runtimeConfig holds the build-time value (or
 * NUXT_COOKIE_SIGNING_SECRET), so a secret set only on the server would otherwise be missed.
 */
export function cookieSigningSecret(event: H3Event): string {
  const config = useRuntimeConfig(event);
  const { secret, derived } = resolveCookieSecret(
    String(process.env.COOKIE_SIGNING_SECRET || config.cookieSigningSecret || ''),
    String(config.boilerplateOrderEditorApiKey || ''),
  );
  if (derived && !derivedWarned) {
    derivedWarned = true;
    console.warn(
      '[cookies] COOKIE_SIGNING_SECRET is not set; signing cookies with a key derived from the order-editor API key. Set a dedicated secret.',
    );
  }
  return secret;
}

/** A signed cookie value for `purpose` (a short label, e.g. 'punchout'), valid for `maxAgeSeconds`. */
export function signCookie(event: H3Event, purpose: string, payload: string, maxAgeSeconds: number): string {
  return signCookieValue(cookieSigningSecret(event), purpose, payload, maxAgeSeconds);
}

/** The payload of a cookie value signed for `purpose` and not expired, else null. */
export function verifyCookie(event: H3Event, purpose: string, value: string | null | undefined): string | null {
  return verifyCookieValue(cookieSigningSecret(event), purpose, value);
}

/** `secure` flag for cookies this app sets (production, or a request that arrived over https). */
export function secureCookie(event: H3Event): boolean {
  return process.env.NODE_ENV === 'production' || getRequestProtocol(event) === 'https';
}

/**
 * The caller's token: a Bearer Authorization header, else the httpOnly `access_token` cookie.
 * Blank, whitespace-only or malformed is no token, so it never starts a viewer lookup.
 */
export function requestBearer(event: H3Event): string | undefined {
  const header = getHeader(event, 'authorization');
  if (header) return /^\s*Bearer\s+(\S+)\s*$/i.exec(header)?.[1];
  return cookieToken(getCookie(event, 'access_token'));
}

/**
 * Client IP for rate limits: see clientIp.ts (TRUSTED_PROXY_HOPS, default 1, read from the runtime
 * environment first, like COOKIE_SIGNING_SECRET).
 */
export function requestClientIp(event: H3Event): string {
  const config = useRuntimeConfig(event);
  return clientIpFrom(
    getHeader(event, 'x-forwarded-for'),
    event.node.req.socket?.remoteAddress,
    Number(process.env.TRUSTED_PROXY_HOPS || config.trustedProxyHops) || 1,
  );
}

/**
 * The request comes from the shop's own pages (see httpGuards.ts): its Origin, when sent, is this
 * host, x-forwarded-host or NUXT_PUBLIC_SITE_URL. `json: true` also requires application/json, which a
 * cross-site form cannot send. For every cookie-authenticated route that changes state.
 */
export function sameOrigin(event: H3Event, { json = false } = {}): boolean {
  const headers = {
    origin: getHeader(event, 'origin'),
    host: getHeader(event, 'host'),
    forwardedHost: getHeader(event, 'x-forwarded-host'),
    contentType: getHeader(event, 'content-type'),
  };
  const siteUrl = String(useRuntimeConfig(event).public?.siteUrl || '');
  return json ? isSameOriginJson(headers, siteUrl) : isSameOrigin(headers, siteUrl);
}

async function fetchViewer(endpoint: string, apiKey: string, token: string): Promise<Viewer | null> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: VIEWER_QUERY }),
    signal: AbortSignal.timeout(10_000),
  });
  // Upstream rejects a forged or malformed token outright: a definite guest.
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`viewer lookup ${res.status}`);
  const json = (await res.json()) as { data?: { viewer?: unknown }; errors?: { extensions?: { code?: string } }[] };
  if (json.errors?.length) {
    if (json.errors.every((e) => e?.extensions?.code === 'UNAUTHENTICATED')) return null;
    throw new Error('viewer lookup errors');
  }
  return parseViewer(json.data?.viewer);
}

let viewerLookup: ViewerLookup | undefined;

/**
 * The verified Contact/Customer behind `token`, or null (guest, rejected token, or a failed lookup:
 * fail closed). Cached per sha256(token) for 2 minutes, shared by concurrent requests.
 */
export function verifiedViewer(event: H3Event, token: string | undefined): Promise<Viewer | null> {
  if (!token) return Promise.resolve(null);
  if (!viewerLookup) {
    const config = useRuntimeConfig(event);
    const endpoint = String(config.boilerplateGraphqlEndpoint || '');
    const apiKey = String(config.boilerplateApiKey || '');
    viewerLookup = createViewerLookup((t) => fetchViewer(endpoint, apiKey, t));
  }
  return viewerLookup(token);
}
