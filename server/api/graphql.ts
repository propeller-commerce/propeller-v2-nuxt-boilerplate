/**
 * /api/graphql — SDK proxy.
 *
 * Mirrors propeller-vue's server.js proxy posture: the client posts here,
 * this handler injects the server-only API key (or order-editor key when
 * `X-Client-ID: order-editor` is set), pipes the body to the upstream
 * endpoint, and streams the response back.
 *
 * Server-side fetches do NOT go through this proxy — they construct their
 * own GraphQLClient via `server/utils/infra.ts` (same-process call avoids
 * the HTTP roundtrip).
 */

import { Buffer } from 'node:buffer';

const ORDER_EDITOR_CLIENT_ID = 'order-editor';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const upstream = config.boilerplateGraphqlEndpoint;

  if (!upstream) {
    setResponseStatus(event, 503);
    return { error: 'BOILERPLATE_GRAPHQL_ENDPOINT not configured' };
  }

  const clientId = getHeader(event, 'x-client-id') ?? '';
  const apiKey =
    clientId === ORDER_EDITOR_CLIENT_ID
      ? config.boilerplateOrderEditorApiKey
      : config.boilerplateApiKey;

  if (!apiKey) {
    setResponseStatus(event, 503);
    return { error: 'API key not configured for this client id' };
  }

  // Forward Authorization (Bearer) and Accept-Language; strip everything
  // else the client tried to set. The upstream expects `apikey` injected
  // server-side.
  const forwardedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: apiKey,
  };
  const auth = getHeader(event, 'authorization');
  if (auth) forwardedHeaders.Authorization = auth;
  const acceptLang = getHeader(event, 'accept-language');
  if (acceptLang) forwardedHeaders['Accept-Language'] = acceptLang;

  const body = await readRawBody(event);
  if (!body) {
    setResponseStatus(event, 400);
    return { error: 'missing body' };
  }

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
