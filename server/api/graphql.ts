/**
 * /api/graphql — SDK proxy.
 *
 * The browser SDK posts here in proxy mode (no apikey); this handler injects the server-only API
 * key, picks the right key per operation and relays the response. Server-side fetches don't come
 * through here (server/utils/infra.ts talks to upstream directly).
 *
 * Guards, in order (every refusal is a GraphQL error, `extensions.code` FORBIDDEN):
 *   - body at most MAX_BODY_BYTES (Content-Length first, then the read size), `query` a string;
 *     only `{ query, variables, operationName }` goes upstream (no persisted-query hashes);
 *   - the document parses, nests at most MAX_QUERY_DEPTH, and never selects `__schema`/`__type`;
 *   - semi-closed / closed shops: prices only for a verified Contact/Customer viewer. Everyone else
 *     gets the response stripped (hidePrices), price filters/sorts dropped from the variables, and
 *     inline price filters or aliased price fields refused;
 *   - every response, for every viewer and portal mode: no cost price (COST_FIELDS keys, aliases on
 *     them refused).
 *
 * Order-editor key, decided from the parsed document (server/utils/orderEditorRouting.ts):
 *   - checkout mutations (orderSetStatus with checkout statuses, triggerQuoteSendRequest,
 *     triggerOrderSendConfirm) only for the order in the signed `propeller_last_order` cookie set
 *     here after cartProcess, each once per order (cookie flags plus a server-side spent log), and
 *     only as the SDK's own documents; otherwise refused, never sent with the storefront key;
 *   - order reads only as the SDK's own `order`, `orders`, `orderGetPDF`, `quoteGetPDF` documents,
 *     without the Bearer (orderReadAllowed): the last order's thank-you page, or a verified viewer's
 *     own orders; every other order read, and order revisions/addresses/shipments, are refused;
 *   - accepting a quote, only when the verified viewer placed it and it is still a QUOTATION;
 *   - `contactRegister` with `X-Client-ID: order-editor`, only for a verified authorization manager
 *     of `input.parentId`;
 *   - self-registration's exact SDK companyCreate / companyAddressCreate
 *     (server/utils/registrationRouting.ts).
 *
 * PunchOut (#20): a relayed magicTokenLogin activates the pending punchout session opened for that
 * same token, or clears punchout (server/utils/punchout.ts).
 */

import { parse, type DocumentNode } from 'graphql';
import type { H3Event } from 'h3';
import { forPriceViewer } from '../utils/hidePrices';
import {
  checkoutMutationAllowed,
  classifyOperation,
  CONTACT_REGISTER_DOCUMENT_HASH,
  contactRegisterParentId,
  createdOrderId,
  createSpentLog,
  LAST_ORDER_COOKIE,
  LAST_ORDER_MAX_AGE,
  ORDER_OWNER_QUERY,
  orderReadAllowed,
  readsOrders,
  settleReserved,
  signLastOrder,
  singleTopLevelField,
  verifyLastOrder,
  type KeyChoice,
} from '../utils/orderEditorRouting';
import {
  hasPriceFilter,
  inspectDocument,
  MAX_BODY_BYTES,
  MAX_QUERY_DEPTH,
  priceGateActive,
  queryDepth,
  strictestPortalMode,
  withoutPriceFilters,
} from '../utils/proxyGuards';
import { formRateLimiter, type RateLimitRule } from '../utils/rateLimit';
import {
  COMPANY_CREATE_FIELD,
  companyCreateVariables,
  CONTACT_FLAG,
  createdCompanyId,
  documentHash,
  hourlyLimit,
  mayRegisterContact,
  registeredContact,
  REGISTRATION_COOKIE,
  REGISTRATION_MAX_AGE,
  registrationStep,
  selectsContactRegister,
  selectsField,
  signRegistration,
  verifyRegistration,
} from '../utils/registrationRouting';
import { cookieSigningSecret, requestBearer, requestClientIp, secureCookie, verifiedViewer } from '../utils/requestAuth';
import { settlePunchoutLogin } from '../utils/punchout';
import { magicTokenExchange } from '../utils/punchoutSession';
import type { Viewer } from '../utils/viewer';

const ORDER_EDITOR_CLIENT_ID = 'order-editor';

// Each elevated companyCreate creates a company in Propeller: per IP and in total per hour (default 5 and 30).
const registrationLimits = (): readonly [RateLimitRule, RateLimitRule] => [
  hourlyLimit(process.env.REGISTRATION_LIMIT_PER_IP, 5),
  hourlyLimit(process.env.REGISTRATION_LIMIT_TOTAL, 30),
];

// Elevated checkout mutations already run, per order (see createSpentLog).
const spentElevations = createSpentLog();

function graphqlError(event: H3Event, status: number, message: string, code = 'FORBIDDEN') {
  setResponseStatus(event, status);
  return { errors: [{ message, extensions: { code } }] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A readable GraphQL answer without errors. */
function graphqlSucceeded(text: string): boolean {
  try {
    const json: unknown = JSON.parse(text);
    return isRecord(json) && !(Array.isArray(json.errors) && json.errors.length);
  } catch {
    return false;
  }
}

/** Status and owner of an order, read with the order-editor key (quote acceptance, order reads: drafts stay hidden). */
async function orderOwner(
  upstream: string,
  orderKey: string,
  orderId: number,
): Promise<{ status?: unknown; userId?: unknown } | null> {
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: orderKey },
      body: JSON.stringify({
        query: ORDER_OWNER_QUERY,
        variables: { orderId },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { order?: { status?: unknown; userId?: unknown } | null } };
    return json.data?.order ?? null;
  } catch {
    return null;
  }
}

async function elevates(
  choice: KeyChoice,
  viewer: () => Promise<Viewer | null>,
  upstream: string,
  orderKey: string,
): Promise<boolean> {
  switch (choice.key) {
    case 'order-editor':
      return true;
    case 'manager':
      return !!(await viewer())?.managerOf.includes(choice.companyId);
    case 'quote-accept': {
      const v = await viewer();
      if (!v) return false;
      const order = await orderOwner(upstream, orderKey, choice.orderId);
      return order?.status === 'QUOTATION' && order.userId === v.userId;
    }
    default:
      return false;
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const upstream = config.boilerplateGraphqlEndpoint;
  if (!upstream) return graphqlError(event, 503, 'GraphQL endpoint not configured', 'SERVICE_UNAVAILABLE');
  if (event.method !== 'POST') return graphqlError(event, 405, 'Use POST');

  // ── Body: size cap, then only { query, variables, operationName } (#3, N1) ──
  // ponytail: a chunked body without Content-Length is read whole before the size check; the
  // reverse proxy's body limit (nginx client_max_body_size, 1 MB by default) bounds it.
  if (Number(getHeader(event, 'content-length')) > MAX_BODY_BYTES) {
    return graphqlError(event, 400, 'Payload too large');
  }
  const raw = await readRawBody(event, false);
  if (!raw?.length) return graphqlError(event, 400, 'Missing body');
  if (raw.length > MAX_BODY_BYTES) return graphqlError(event, 400, 'Payload too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return graphqlError(event, 400, 'Invalid JSON body');
  }
  if (!isRecord(parsed) || typeof parsed.query !== 'string') {
    return graphqlError(event, 400, 'query must be a string (persisted queries are not supported)');
  }
  const query = parsed.query;
  const operationName = typeof parsed.operationName === 'string' ? parsed.operationName : undefined;
  let variables: unknown = isRecord(parsed.variables) ? parsed.variables : undefined;

  // ── One parse for every guard (#17) ──
  let doc: DocumentNode;
  try {
    doc = parse(query, { noLocation: true });
  } catch {
    // Upstream would reject it too; refusing keeps a parser difference from hiding a document from the guards.
    return graphqlError(event, 400, 'Invalid GraphQL document', 'GRAPHQL_PARSE_FAILED');
  }
  const depth = queryDepth(doc);
  if (depth > MAX_QUERY_DEPTH) return graphqlError(event, 400, `Query depth ${depth} exceeds limit ${MAX_QUERY_DEPTH}`);
  const guards = inspectDocument(doc);
  if (guards.introspection) return graphqlError(event, 400, 'Introspection is not allowed'); // #13
  // Cost prices are stripped by key name, in every mode, so no alias may rename one.
  if (guards.costAlias) return graphqlError(event, 403, 'Forbidden: aliases on cost and discount fields are not allowed');
  const single = singleTopLevelField(doc);

  // Resolve the caller's session: an explicit Authorization header, else the httpOnly
  // `access_token` cookie (the browser SDK loses its in-memory token on reload). A blank or
  // malformed token is no token: anonymous, no viewer lookup, price gate closed.
  const token = requestBearer(event);
  const auth = token ? `Bearer ${token}` : undefined;
  const isAnonymous = !token;
  const orderKey = config.boilerplateOrderEditorApiKey || '';
  const secret = orderKey ? cookieSigningSecret(event) : '';

  // One verified-viewer lookup per request at most, started only when something needs it.
  let viewerPromise: Promise<Viewer | null> | undefined;
  const viewer = () => (viewerPromise ??= verifiedViewer(event, token));

  // ── Self-registration (#12): the SDK's own companyCreate / companyAddressCreate ──
  const registration = secret ? verifyRegistration(secret, getCookie(event, REGISTRATION_COOKIE)) : null;
  const regStep = secret ? registrationStep(single, doc, variables, { isAnonymous, registration }) : null;
  // A company is created only by that step, never by another document on the storefront key.
  if (regStep?.kind !== 'company' && selectsField(doc, COMPANY_CREATE_FIELD)) {
    return graphqlError(event, 403, 'Forbidden: company registration is not allowed here');
  }
  if (regStep?.kind === 'company') {
    const ip = requestClientIp(event);
    const [perIp, total] = registrationLimits();
    for (const [key, rule] of [
      [`registration-company:${ip}`, perIp],
      ['registration-company:*', total],
    ] as const) {
      const hit = formRateLimiter.hit(key, rule);
      if (!hit.allowed) {
        setResponseHeader(event, 'Retry-After', hit.retryAfter);
        return graphqlError(event, 429, 'Too many registrations, try again later', 'RATE_LIMITED');
      }
    }
    variables = companyCreateVariables(variables);
  }

  // ── Order-editor key (#1, #2, open question 1) ──
  const cookieOrder = secret ? verifyLastOrder(secret, getCookie(event, LAST_ORDER_COOKIE)) : null;
  // Flags from the cookie plus the server's own record, which a replayed older cookie can't undo.
  const lastOrder = cookieOrder
    ? { orderId: cookieOrder.orderId, used: cookieOrder.used + spentElevations.flags(cookieOrder.orderId) }
    : null;
  const choice: KeyChoice =
    orderKey && !regStep
      ? classifyOperation({
          doc,
          single,
          variables,
          isAnonymous,
          orderEditorOptIn: getHeader(event, 'x-client-id') === ORDER_EDITOR_CLIENT_ID,
          lastOrder,
        })
      : { key: 'general' };

  // ── Order reads: only the owner's, with the order-editor key ──
  const orderRead = readsOrders(doc);
  if (orderRead) {
    const allowed =
      !!orderKey &&
      (await orderReadAllowed({
        doc,
        single,
        variables,
        viewer: await viewer(),
        lastOrder,
        orderOwner: (orderId) => orderOwner(upstream, orderKey, orderId),
      }));
    if (!allowed) return graphqlError(event, 403, 'Forbidden: orders are readable only by their owner');
  }

  // ── Price gate (#4): semi-closed / closed only; open shops skip it entirely ──
  const gate = priceGateActive(strictestPortalMode(config.boilerplatePortalMode, config.public.portalMode));
  // Registration runs without the Bearer, so its response is a guest's.
  const canSee = gate ? (regStep ? Promise.resolve(false) : viewer().then(Boolean)) : Promise.resolve(true);
  if (gate && (guards.foreignAlias || guards.inlinePriceFilter) && !(await canSee)) {
    return graphqlError(event, 400, 'Aliases, price filters and price sorts need a login');
  }
  if (gate && hasPriceFilter(variables) && !(await canSee)) variables = withoutPriceFilters(variables);

  try {
    // Self-registration's contact step: the SDK's own contactRegister, anonymous, into the company this
    // browser just created, once. It needs the order-editor key, like the company and address steps.
    const contactStep =
      !!secret &&
      documentHash(doc) === CONTACT_REGISTER_DOCUMENT_HASH &&
      mayRegisterContact(contactRegisterParentId(single, variables), { isAnonymous, registration });
    const useOrderKey = orderRead || !!regStep || contactStep || (await elevates(choice, viewer, upstream, orderKey));
    if (!checkoutMutationAllowed(doc, useOrderKey)) {
      return graphqlError(event, 403, "Forbidden: checkout steps run only for this browser's own order");
    }
    // contactRegister runs only elevated: a manager's call or this browser's own self-registration.
    if (!useOrderKey && selectsContactRegister(doc)) {
      return graphqlError(event, 403, 'Forbidden: contact registration is not allowed here');
    }
    const apiKey = useOrderKey ? orderKey : config.boilerplateApiKey;
    if (!apiKey) return graphqlError(event, 503, 'API key not configured', 'SERVICE_UNAVAILABLE');

    // Spend the checkout mutation for this order before the call. The flags read above can be stale
    // by now (viewer lookups awaited since), so reserve() checks and spends in one synchronous step
    // with no await before the upstream call: of N parallel requests with the same last-order cookie
    // only one gets the key. A call that throws or fails releases it (settleReserved).
    const flag = choice.key === 'order-editor' && useOrderKey ? choice.flag : undefined;
    if (flag && lastOrder && !spentElevations.reserve(lastOrder.orderId, flag)) {
      return graphqlError(event, 403, 'This checkout step already ran for this order');
    }
    const reserved = flag && lastOrder ? { orderId: lastOrder.orderId, flag } : null;

    // Forward the Bearer and Accept-Language only; X-Client-ID is server-internal. Registration and
    // order reads go without the Bearer, so only the order-editor key decides.
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: apiKey };
    if (auth && !regStep && !orderRead && !contactStep) headers.Authorization = auth;
    const acceptLang = getHeader(event, 'accept-language');
    if (acceptLang) headers['Accept-Language'] = acceptLang;

    const answer = await settleReserved(
      spentElevations,
      reserved,
      async () => {
        const response = await fetch(upstream, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables, operationName }),
        });
        return { response, text: await response.text() };
      },
      ({ response, text }) => !response.ok || !graphqlSucceeded(text),
    );
    const upstreamResponse = answer.response;
    let text = answer.text;
    setResponseStatus(event, upstreamResponse.status);
    setResponseHeader(event, 'content-type', upstreamResponse.headers.get('content-type') ?? 'application/json');

    const seesPrices = await canSee;

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Unreadable upstream answer: never relay it unstripped.
      return graphqlError(event, 502, 'Upstream answered with an unreadable response', 'BAD_GATEWAY');
    }
    const ok = upstreamResponse.ok && !(isRecord(json) && Array.isArray(json.errors) && json.errors.length);
    const magic = magicTokenExchange(single, variables, json);
    if (magic) settlePunchoutLogin(event, magic.token, ok ? magic.accessToken : null);
    // Every answer loses the merchant's cost prices; prices too for a viewer who may not see them.
    text = JSON.stringify(forPriceViewer(json, seesPrices));
    const cookieOptions = (maxAge: number) =>
      ({ httpOnly: true, secure: secureCookie(event), sameSite: 'lax', path: '/', maxAge }) as const;

    // Remember the order this browser just placed (thank-you page, checkout mutations).
    const newOrderId = secret && upstreamResponse.ok ? createdOrderId(single, json) : null;
    if (newOrderId) {
      setCookie(event, LAST_ORDER_COOKIE, signLastOrder(secret, newOrderId), cookieOptions(LAST_ORDER_MAX_AGE));
    }
    // An elevated checkout mutation that succeeded is spent for this order (reserved above).
    if (flag && lastOrder && ok) {
      if (!newOrderId) {
        const used = [...new Set(lastOrder.used + flag)].join('');
        setCookie(event, LAST_ORDER_COOKIE, signLastOrder(secret, lastOrder.orderId, used), cookieOptions(LAST_ORDER_MAX_AGE));
      }
    }
    // Remember the company this browser just registered, and which of its addresses were created.
    const newCompanyId = regStep?.kind === 'company' && ok ? createdCompanyId(json) : null;
    const regCookie = newCompanyId
      ? signRegistration(secret, newCompanyId)
      : regStep?.kind === 'address' && registration && ok
        ? signRegistration(secret, regStep.companyId, registration.used + regStep.flag)
        : contactStep && registration && registeredContact(json)
          ? signRegistration(secret, registration.companyId, registration.used + CONTACT_FLAG)
          : '';
    if (regCookie) setCookie(event, REGISTRATION_COOKIE, regCookie, cookieOptions(REGISTRATION_MAX_AGE));

    return text;
  } catch (e) {
    console.error('[graphql proxy] upstream request failed:', e instanceof Error ? e.name : 'unknown');
    // Internal details only in development (#15).
    return graphqlError(
      event,
      502,
      import.meta.dev && e instanceof Error ? e.message : 'Upstream request failed',
      'BAD_GATEWAY',
    );
  }
});
