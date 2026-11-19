/**
 * Server-side PunchOut wiring (OCI + cXML) — Nitro.
 *
 * The Nuxt mirror of `propeller-next/lib/punchout.ts` and
 * `propeller-vue/frontend/src/server/punchout.js`. The wire-format parsing /
 * building and the cart→ERP field mapping live in the pure, SDK-free
 * `@propeller-commerce/propeller-v2-punchout` package; this module owns the
 * app-specific glue: the enable flag, the admin SDK client that mints magic
 * tokens, the cXML buyer-credential lookup, an authed client for the cart
 * fetch, and the config bridge (currency/target/mappings from runtimeConfig).
 *
 * Server-only. Read via `useRuntimeConfig(event)`.
 */

import type { H3Event } from 'h3';
import { deleteCookie, getCookie, setCookie } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { GraphQLClient, MagicTokenService, AttributeService } from '@propeller-commerce/propeller-sdk-v2';
import { validateSharedSecret, type Mapping } from '@propeller-commerce/propeller-v2-punchout';
import { cookieSigningSecret, requestBearer, secureCookie } from './requestAuth';
import {
  hookUrl,
  openPunchout,
  PENDING_MAX_AGE,
  PUNCHOUT_COOKIE,
  PUNCHOUT_FLAG_COOKIE,
  PUNCHOUT_MAX_AGE,
  PUNCHOUT_PENDING_COOKIE,
  PURPOSE,
  sealPunchout,
  type PunchoutSession,
} from './punchoutSession';

/** The return URL when it may receive a cart: https, and in PUNCHOUT_HOOK_HOSTS when that is set. */
export function allowedHookUrl(event: H3Event, raw: unknown): URL | null {
  const config = useRuntimeConfig(event);
  return hookUrl(raw, String(config.punchoutHookHosts || process.env.PUNCHOUT_HOOK_HOSTS || ''));
}

const cookieBase = (event: H3Event, maxAge: number) =>
  ({ path: '/', sameSite: 'lax', secure: secureCookie(event), maxAge }) as const;

/** `enter`: remember the session until the magic-token exchange of `mtoken` succeeds. */
export function setPendingPunchout(event: H3Event, session: PunchoutSession, mtoken: string): boolean {
  const value = sealPunchout(cookieSigningSecret(event), PURPOSE.pending, session, mtoken, PENDING_MAX_AGE);
  if (!value) return false;
  setCookie(event, PUNCHOUT_PENDING_COOKIE, value, { ...cookieBase(event, PENDING_MAX_AGE), httpOnly: true });
  return true;
}

/**
 * Clear the punchout cookies that are present. `pending: false` keeps the pending one: the
 * magic-login page logs out right before its exchange, and a pending session activates only through
 * that exchange.
 */
export function clearPunchout(event: H3Event, { pending = true } = {}): void {
  const names = [PUNCHOUT_COOKIE, PUNCHOUT_FLAG_COOKIE, ...(pending ? [PUNCHOUT_PENDING_COOKIE] : [])];
  for (const name of names) if (getCookie(event, name) !== undefined) deleteCookie(event, name, { path: '/' });
}

/**
 * The proxy relayed a magicTokenLogin: activate the pending session when this exchange of its own
 * token succeeded, bound to the access token it produced; any other magic login clears punchout.
 */
export function settlePunchoutLogin(event: H3Event, token: string, accessToken: string | null): void {
  const secret = cookieSigningSecret(event);
  const pending = openPunchout(secret, PURPOSE.pending, getCookie(event, PUNCHOUT_PENDING_COOKIE), token);
  const active = pending && accessToken ? sealPunchout(secret, PURPOSE.active, pending, accessToken, PUNCHOUT_MAX_AGE) : '';
  if (!active) {
    clearPunchout(event);
    return;
  }
  setCookie(event, PUNCHOUT_COOKIE, active, { ...cookieBase(event, PUNCHOUT_MAX_AGE), httpOnly: true });
  setCookie(event, PUNCHOUT_FLAG_COOKIE, pending!.mode, { ...cookieBase(event, PUNCHOUT_MAX_AGE), httpOnly: false });
  deleteCookie(event, PUNCHOUT_PENDING_COOKIE, { path: '/' });
}

/** The active session when it belongs to `accessToken` (default: the access_token cookie). */
export function activePunchout(event: H3Event, accessToken = requestBearer(event)): PunchoutSession | null {
  return openPunchout(cookieSigningSecret(event), PURPOSE.active, getCookie(event, PUNCHOUT_COOKIE), accessToken);
}

/** Contact track attribute holding the cXML shared secret (backend side). */
const CXML_SHARED_SECRET_ATTR = 'CXML_SHARED_SECRET';

/** Image filters for the server-side cart fetch (mirror of the grid defaults). */
export const CART_IMAGE_FILTERS = {
  imageSearchFilters: { page: 1, offset: 1 },
  imageVariantFilters: {
    transformations: [
      { name: 'thumb', transformation: { format: 'WEBP', height: 100, width: 100, fit: 'BOUNDS' } },
    ],
  },
};

/**
 * Non-secret mapping-override point mirroring next's `config.punchout`. Deep-
 * merged over the package defaults (`DEFAULT_OCI_MAPPING` / `DEFAULT_CXML_MAPPING`);
 * see the package README for the rule shape.
 */
export const PUNCHOUT_MAPPINGS: { ociMapping: Partial<Mapping>; cxmlMapping: Partial<Mapping> } = {
  ociMapping: {},
  cxmlMapping: {},
};

export function isPunchoutEnabled(event: H3Event): boolean {
  const config = useRuntimeConfig(event);
  // String(): a runtime NUXT_PUNCHOUT_ENABLED=true arrives as a boolean.
  return String(config.punchoutEnabled ?? '').trim().toLowerCase() === 'true';
}

/**
 * Debug mode — the transfer route renders a readable OCI/cXML preview page (the
 * plugin's `oci_results`/`cxml_results` sink) instead of auto-POSTing to the
 * ERP, and leaves the cart intact so it's re-testable.
 */
export function isPunchoutDebug(event: H3Event): boolean {
  const config = useRuntimeConfig(event);
  return String(config.punchoutDebug ?? '').trim().toLowerCase() === 'true';
}

export function punchoutContext(event: H3Event) {
  const config = useRuntimeConfig(event);
  return {
    currency: config.punchoutCurrency || 'EUR',
    transferTarget: config.punchoutTransferTarget || '_self',
    language: config.boilerplateDefaultLanguage || 'NL',
  };
}

/**
 * `magicTokenCreate` is admin-gated — route it through the order-editor key by
 * adding it to the editor mutation set (same trick server/utils/msp.ts uses for
 * paymentCreate). REPLACES the SDK default list, so the defaults are repeated (minus
 * passwordResetLink, which must never run with this key: it returns the reset link).
 */
const PUNCHOUT_ORDER_EDITOR_MUTATIONS = [
  'orderSetStatus',
  'triggerQuoteSendRequest',
  'triggerOrderSendConfirm',
  'magicTokenCreate',
];

function createPunchoutAdminClient(event: H3Event): GraphQLClient {
  const config = useRuntimeConfig(event);
  // PunchOut setup is a privileged server flow: it reads ANOTHER contact's
  // CXML_SHARED_SECRET (a query, authenticated by `apiKey`) and mints a magic
  // token (an admin-gated mutation, authenticated by `orderEditorApiKey`). Both
  // need elevated rights, so the order-editor key drives the whole client
  // (falling back to the general key if unset).
  const adminKey = config.boilerplateOrderEditorApiKey || config.boilerplateApiKey || '';
  return new GraphQLClient({
    endpoint: config.boilerplateGraphqlEndpoint || '',
    apiKey: adminKey,
    orderEditorApiKey: adminKey,
    securityMode: 'direct',
    timeout: 30000,
    orderEditorMutations: PUNCHOUT_ORDER_EDITOR_MUTATIONS,
  });
}

/** Read a contact's text track-attribute values (mirrors the machines helper). */
function readAttributeStringValues(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const v = value as { textValues?: { values?: unknown[] }[]; enumValues?: unknown[]; value?: unknown };
  const out: string[] = [];
  for (const tv of v.textValues ?? []) for (const s of tv?.values ?? []) out.push(String(s));
  for (const s of v.enumValues ?? []) out.push(String(s));
  if (out.length === 0 && v.value != null) {
    return String(v.value).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/** Authed client for the cart fetch — carries the logged-in user's bearer. */
export function createAuthedClient(event: H3Event, bearer?: string): GraphQLClient {
  const config = useRuntimeConfig(event);
  return new GraphQLClient({
    endpoint: config.boilerplateGraphqlEndpoint || '',
    apiKey: config.boilerplateApiKey || '',
    securityMode: 'direct',
    timeout: 30000,
    ...(bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : {}),
  });
}

/** One hour, in ms — the punchout magic token's lifetime. */
const PUNCHOUT_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Mint a magic token for the buyer contact (cXML setup handoff). One-time use
 * and expiring 1h from creation, so a leaked/replayed StartPage link is inert
 * after a single sign-in or an hour, whichever comes first.
 */
export async function createPunchoutMagicToken(event: H3Event, contactId: number): Promise<string> {
  const svc = new MagicTokenService(createPunchoutAdminClient(event));
  const expiresAt = new Date(Date.now() + PUNCHOUT_TOKEN_TTL_MS).toISOString();
  const token = await svc.createMagicToken({ contactId, oneTimeUse: true, expiresAt });
  return token.id;
}

/**
 * Resolve an inbound cXML request to its buyer contact, mirroring the WP plugin
 * (`CxmlTrait::handlePunchOutSetupRequest` + `validatePunchoutCredentials`).
 *
 * `CXML_CONTACT_ID` (CSV, = the plugin's `PROPELLER_CXML_CONTACT_ID`) lists the
 * candidate buyer contacts. For each we read the `CXML_SHARED_SECRET` contact
 * track attribute from the GraphQL API and constant-time compare it to the
 * request's SharedSecret — the SECRET identifies the buyer (Sender Identity is
 * ignored, exactly as the plugin does). Returns the matching contactId.
 */
export async function resolveCxmlBuyer(
  event: H3Event,
  sharedSecret: string,
): Promise<{ contactId: number } | null> {
  if (!sharedSecret) return null;
  const ids = (useRuntimeConfig(event).cxmlContactId || '')
    .split(',')
    .map((s: string) => parseInt(s.trim(), 10))
    .filter((n: number) => Number.isFinite(n));
  if (ids.length === 0) return null;

  const svc = new AttributeService(createPunchoutAdminClient(event));
  for (const contactId of ids) {
    try {
      const res = await svc.getAttributeResultByContactId({ contactId, input: { page: 1, offset: 50 } });
      const item = (res.items ?? []).find((i) => i.attributeDescription?.name === CXML_SHARED_SECRET_ATTR);
      const stored = readAttributeStringValues(item?.value)[0];
      if (stored && validateSharedSecret(sharedSecret, stored)) return { contactId };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
