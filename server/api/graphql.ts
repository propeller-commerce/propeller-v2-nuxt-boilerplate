/**
 * /api/graphql — SDK proxy.
 *
 * The client posts here in proxy mode (no apikey in the body); this handler
 * injects the server-only API key, picks the RIGHT key per operation, pipes the
 * body to the upstream endpoint, and streams the response back.
 *
 * Key routing (mirrors propeller-vue's server.js + propeller-next's
 * app/api/graphql/route.ts): the Propeller backend authorizes certain sensitive
 * operations ONLY against the order-editor key — sending them with the general
 * key returns "Forbidden resource". Because the browser SDK runs in proxy mode
 * (no key sent), the proxy is the authoritative router. It selects the key by
 * the GraphQL operation NAME:
 *   - ORDER_EDITOR_MUTATIONS (orderSetStatus, …) → order-editor key. This is
 *     what `useCheckout().placeOrder` issues to set the order UNFINISHED for a
 *     PSP (Mollie) checkout; without this it 403s and the redirect never fires.
 *   - ORDER_EDITOR_QUERIES ({order}) for ANONYMOUS callers → order-editor key,
 *     so the thank-you page can read a just-placed order (the general key 403s
 *     the `order` query).
 *   - ORDER_EDITOR_OPT_IN_MUTATIONS ({contactRegister}) → order-editor key ONLY
 *     when the caller sets `X-Client-ID: order-editor` (the operation name is
 *     shared with public self-registration, so intent is signalled by header).
 *
 * Server-side fetches do NOT go through this proxy — they construct their own
 * GraphQLClient via `server/utils/infra.ts` (same-process call avoids the HTTP
 * roundtrip). The Mollie provider likewise talks to upstream directly via
 * `server/utils/mollie.ts`.
 */

import { Buffer } from 'node:buffer';

const ORDER_EDITOR_CLIENT_ID = 'order-editor';

// Mirrors the SDK's DEFAULT_ORDER_EDITOR_MUTATIONS (GraphQLClient.ts). Keep in
// sync if the SDK list changes. These operation names route to the order key.
const ORDER_EDITOR_MUTATIONS = new Set([
  'orderSetStatus',
  'passwordResetLink',
  'triggerQuoteSendRequest',
  'triggerOrderSendConfirm',
]);

// Queries the general key isn't allowed to resolve. The `order` query (thank-you
// page / order-detail screens fetching a single order by id) returns "Forbidden
// resource" under the general key for anonymous callers; only the order-editor
// key authorizes it. Authenticated callers carry a Bearer token and resolve it
// under their own session, so this escalation is anonymous-only.
const ORDER_EDITOR_QUERIES = new Set(['order']);

// Operations that route to the order key ONLY when the caller identifies as the
// order-editor client (via `X-Client-ID`). `contactRegister` is used by BOTH
// public self-registration (general key) AND authorization-settings "add
// contact" (order key) — same operation name, so intent is signalled by header.
const ORDER_EDITOR_OPT_IN_MUTATIONS = new Set(['contactRegister']);

/**
 * Extract a GraphQL operation name. Prefer the explicit `operationName` the SDK
 * sends in the body; fall back to the first `query NAME` / `mutation NAME` in
 * the document (mirrors the SDK's `extractOperationName`), stripping leading
 * `#` comment lines first. Returns undefined for anonymous operations.
 */
function extractOperationName(parsed: { operationName?: unknown; query?: unknown }): string | undefined {
  if (typeof parsed.operationName === 'string' && parsed.operationName) {
    return parsed.operationName;
  }
  if (typeof parsed.query === 'string') {
    const stripped = parsed.query.replace(/^\s*(#[^\n]*\n)+/g, '').trimStart();
    const match = stripped.match(/^(?:query|mutation)\s+(\w+)/);
    if (match) return match[1];
  }
  return undefined;
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

  // Parse the operation name to route the key. Tolerate parse failures — a
  // malformed body just falls through to the general key (upstream rejects it).
  let parsed: { operationName?: unknown; query?: unknown } = {};
  try {
    parsed = JSON.parse(typeof body === 'string' ? body : Buffer.from(body).toString('utf-8'));
  } catch {
    /* leave parsed = {} → general key */
  }
  const operationName = extractOperationName(parsed);

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
  const clientId = getHeader(event, 'x-client-id') ?? '';
  const orderEditorOptIn = clientId === ORDER_EDITOR_CLIENT_ID;

  // Decide which key authorizes this operation.
  const useOrderKey =
    !!config.boilerplateOrderEditorApiKey &&
    !!operationName &&
    (ORDER_EDITOR_MUTATIONS.has(operationName) ||
      (isAnonymous && ORDER_EDITOR_QUERIES.has(operationName)) ||
      (orderEditorOptIn && ORDER_EDITOR_OPT_IN_MUTATIONS.has(operationName)));

  const apiKey = useOrderKey ? config.boilerplateOrderEditorApiKey : config.boilerplateApiKey;

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
      body: typeof body === 'string' ? body : Buffer.from(body),
    });

    const text = await upstreamResponse.text();

    setResponseStatus(event, upstreamResponse.status);
    setResponseHeader(event, 'content-type', upstreamResponse.headers.get('content-type') ?? 'application/json');
    return text;
  } catch (e) {
    setResponseStatus(event, 502);
    return { error: e instanceof Error ? e.message : 'upstream fetch failed' };
  }
});
