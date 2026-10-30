/**
 * /api/graphql — SDK proxy.
 *
 * The client posts here in proxy mode (no apikey in the body); this handler
 * injects the server-only API key, picks the RIGHT key per operation, pipes the
 * body to the upstream endpoint, and streams the response back.
 *
 * Key routing: the Propeller backend authorizes certain sensitive operations
 * ONLY against the order-editor key. The browser SDK runs in proxy mode (no key
 * sent), so this proxy decides — from the PARSED document, never the
 * client-supplied operationName (see server/utils/orderEditorRouting.ts):
 *   - a single allowlisted mutation (orderSetStatus, …) → order-editor key;
 *   - an anonymous `order` query → order-editor key only for the order id in
 *     the signed `propeller_last_order` cookie, set here when a cartProcess
 *     response carries the new order id (the guest thank-you page);
 *   - `contactRegister` with `X-Client-ID: order-editor` → order-editor key only
 *     for a caller whose session the upstream accepts.
 *
 * Server-side fetches do NOT go through this proxy — they construct their own
 * GraphQLClient via `server/utils/infra.ts` (same-process call avoids the HTTP
 * roundtrip). The Mollie provider likewise talks to upstream directly via
 * `server/utils/mollie.ts`.
 */

import { Buffer } from 'node:buffer';

import {
  classifyOperation,
  createdOrderId,
  LAST_ORDER_COOKIE,
  LAST_ORDER_MAX_AGE,
  signLastOrder,
  verifyLastOrder,
} from '../utils/orderEditorRouting';

const ORDER_EDITOR_CLIENT_ID = 'order-editor';

// True when the upstream resolves a viewer for this Authorization header.
async function hasValidSession(upstream: string, apiKey: string, auth: string): Promise<boolean> {
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey, Authorization: auth },
      body: JSON.stringify({ query: '{ viewer { __typename } }' }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: { viewer?: unknown }; errors?: unknown[] };
    return !!json?.data?.viewer && !json.errors?.length;
  } catch {
    return false;
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const upstream = config.boilerplateGraphqlEndpoint;

  if (!upstream) {
    setResponseStatus(event, 503);
    return { error: 'BOILERPLATE_GRAPHQL_ENDPOINT not configured' };
  }

  const body = await readRawBody(event);
  if (!body) {
    setResponseStatus(event, 400);
    return { error: 'missing body' };
  }

  // A malformed body falls through to the general key (upstream rejects it).
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(typeof body === 'string' ? body : Buffer.from(body).toString('utf-8'));
  } catch {
    /* general key */
  }

  // Resolve the caller's session. The browser SDK runs in proxy mode and does
  // NOT attach a Bearer header on reloads (the in-memory token from login is
  // lost), but the httpOnly `access_token` cookie rides along on every
  // same-origin request. Read it and forward it as the Bearer so authenticated
  // operations resolve under the USER's session instead of the apikey's default
  // account (which surfaced as "viewer returns 1 company, not 3"). An explicit
  // Authorization header still wins. Mirrors propeller-next's /api/graphql route.
  const cookieToken = getCookie(event, 'access_token');
  const auth = getHeader(event, 'authorization') ?? (cookieToken ? `Bearer ${cookieToken}` : undefined);
  const isAnonymous = !auth;
  const orderEditorOptIn = getHeader(event, 'x-client-id') === ORDER_EDITOR_CLIENT_ID;
  const orderKey = config.boilerplateOrderEditorApiKey;

  const choice = orderKey
    ? classifyOperation({
        body: parsed,
        isAnonymous,
        orderEditorOptIn,
        lastOrderId: verifyLastOrder(getCookie(event, LAST_ORDER_COOKIE), orderKey),
      })
    : 'general';
  const useOrderKey =
    choice === 'order-editor' ||
    (choice === 'order-editor-session' && !!auth && (await hasValidSession(upstream, config.boilerplateApiKey, auth)));

  const apiKey = useOrderKey ? orderKey : config.boilerplateApiKey;

  if (!apiKey) {
    setResponseStatus(event, 503);
    return { error: 'API key not configured for this client id' };
  }

  // Forward Authorization (Bearer) and Accept-Language; strip everything else
  // the client tried to set. The upstream expects `apikey` injected server-side.
  // `X-Client-ID` is server-internal — never forwarded upstream.
  const forwardedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: apiKey,
  };
  if (auth) forwardedHeaders.Authorization = auth;
  const acceptLang = getHeader(event, 'accept-language');
  if (acceptLang) forwardedHeaders['Accept-Language'] = acceptLang;

  try {
    const upstreamResponse = await fetch(upstream, {
      method: 'POST',
      headers: forwardedHeaders,
      // Elevated requests forward exactly what was classified.
      body: useOrderKey ? JSON.stringify(parsed) : typeof body === 'string' ? body : Buffer.from(body),
    });

    const text = await upstreamResponse.text();

    const newOrderId = orderKey && upstreamResponse.ok ? createdOrderId(parsed, text) : null;
    if (newOrderId) {
      setCookie(event, LAST_ORDER_COOKIE, signLastOrder(newOrderId, orderKey), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || getRequestProtocol(event) === 'https',
        sameSite: 'lax',
        path: '/',
        maxAge: LAST_ORDER_MAX_AGE,
      });
    }

    setResponseStatus(event, upstreamResponse.status);
    setResponseHeader(event, 'content-type', upstreamResponse.headers.get('content-type') ?? 'application/json');
    return text;
  } catch (e) {
    setResponseStatus(event, 502);
    return { error: e instanceof Error ? e.message : 'upstream fetch failed' };
  }
});
