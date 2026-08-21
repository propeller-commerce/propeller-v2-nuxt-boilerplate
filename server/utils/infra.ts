/**
 * Server-side infra factory — mirrors propeller-next/lib/server.ts'
 * `getServerInfra` / `getAnonymousInfra` / `getListingInfra` / `hasAuthCookie`,
 * adapted to H3.
 *
 * Each helper takes an `H3Event` (Nuxt's per-request context). Cookie reads
 * go through H3's `getCookie(event, name)` instead of Next's `cookies()`.
 * Per-request `getViewer` dedupe stashes on `event.context.viewer` (the H3
 * equivalent of React.cache).
 */

import type { H3Event } from 'h3';
import { getCookie } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
  GraphQLClient,
  type GraphQLClientConfig,
  type Contact,
  type Customer,
} from '@propeller-commerce/propeller-sdk-v2';
import { createServices, toPlain, type Services } from '@propeller-commerce/propeller-v2-vue-ui/shared';

export interface ServerInfra {
  client: GraphQLClient;
  services: Services;
  user: Contact | Customer | null;
  language: string;
  portalMode: string;
  currency: string;
  includeTax: boolean;
  selectedCompanyId?: number;
  /**
   * Whether SDK fetches built on this infra are safe to cache. True for
   * `getAnonymousInfra()`; false for `getServerInfra()` (the cookie read
   * already opts the route into dynamic rendering).
   */
  cacheable: boolean;
}

interface CreateServerClientOptions {
  bearerToken?: string;
  endpoint?: string;
  apiKey?: string;
  getAccessToken?: () => string | undefined;
}

function readPortalMode(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower === 'semiclosed') return 'semi-closed';
  return lower || 'open';
}

function createServerClient(event: H3Event, opts: CreateServerClientOptions = {}): GraphQLClient {
  const config = useRuntimeConfig(event);
  const endpoint = opts.endpoint ?? config.boilerplateGraphqlEndpoint ?? '';
  const apiKey = opts.apiKey ?? config.boilerplateApiKey ?? '';

  if (!endpoint) {
    console.warn(
      '[server/utils/infra] BOILERPLATE_GRAPHQL_ENDPOINT is empty. ' +
      'Server-side SDK calls will fail. Set it in .env.'
    );
  }

  const clientConfig: GraphQLClientConfig = {
    endpoint,
    apiKey,
    orderEditorApiKey: config.boilerplateOrderEditorApiKey ?? '',
    securityMode: 'direct',
    timeout: 30000,
    getAccessToken: opts.getAccessToken,
    ...(opts.bearerToken && { headers: { Authorization: `Bearer ${opts.bearerToken}` } }),
  };
  return new GraphQLClient(clientConfig);
}

/**
 * Per-request dedupe of `getViewer`. A layout + page may each call
 * `getServerInfra()`; without this, the SDK call runs twice. Stash the
 * promise on `event.context.viewer` keyed by the bearer token.
 */
async function cachedGetViewer(event: H3Event, services: Services): Promise<Contact | Customer | null> {
  const ctx = event.context as { viewer?: Promise<Contact | Customer | null> };
  if (ctx.viewer) return ctx.viewer;
  ctx.viewer = (async () => {
    try {
      // Paginate the viewer's companies + purchase-auth configs so the
      // SSR-rendered user matches the client (see app/utils/config.ts
      // contactPAConfigInput / contactCompaniesSearchInput — inlined here
      // because this Nitro-only util can't import the app-dir config). Machine
      // attributes stay CSR (no companyAttributesInput).
      const viewer = await services.user.getViewer({
        contactPAConfigInput: { page: 1, offset: 50 },
        contactCompaniesSearchInput: { page: 1, offset: 50 },
      });
      return viewer ? ((toPlain(viewer) as unknown) as Contact | Customer) : null;
    } catch {
      return null;
    }
  })();
  return ctx.viewer;
}

function readIncludeTax(event: H3Event): boolean {
  const raw = getCookie(event, 'price_include_tax');
  if (raw === undefined) return true;
  return raw === '1';
}

function readSelectedCompanyId(event: H3Event): number | undefined {
  const raw = getCookie(event, 'selected_company_id');
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * True when the request carries an `access_token` cookie.
 */
export function hasAuthCookie(event: H3Event): boolean {
  return !!getCookie(event, 'access_token');
}

/**
 * Authenticated infra — reads `access_token`, `price_include_tax`,
 * `selected_company_id` cookies. Always `cacheable: false`.
 */
export async function getServerInfra(event: H3Event): Promise<ServerInfra> {
  const runtimeConfig = useRuntimeConfig(event);
  const token = getCookie(event, 'access_token');
  const includeTax = readIncludeTax(event);
  const selectedCompanyId = readSelectedCompanyId(event);

  const client = createServerClient(event, { bearerToken: token });
  const services = createServices(client);

  const user: Contact | Customer | null = token ? await cachedGetViewer(event, services) : null;

  return {
    client,
    services,
    user,
    language: runtimeConfig.boilerplateDefaultLanguage || 'NL',
    portalMode: readPortalMode(runtimeConfig.boilerplatePortalMode || 'open'),
    currency: runtimeConfig.boilerplateCurrency || '€',
    includeTax,
    selectedCompanyId,
    cacheable: false,
  };
}

/**
 * Anonymous infra — no cookie reads. `cacheable: true`. Use for routes that
 * don't render personalised prices.
 */
export function getAnonymousInfra(event: H3Event): ServerInfra {
  const runtimeConfig = useRuntimeConfig(event);
  const client = createServerClient(event, { getAccessToken: () => undefined });
  const services = createServices(client);
  return {
    client,
    services,
    user: null,
    language: runtimeConfig.boilerplateDefaultLanguage || 'NL',
    portalMode: readPortalMode(runtimeConfig.boilerplatePortalMode || 'open'),
    currency: runtimeConfig.boilerplateCurrency || '€',
    includeTax: false,
    cacheable: true,
  };
}

/**
 * Anonymous infra that honours the VAT toggle cookie. Reading the cookie
 * opts the route into dynamic rendering — `cacheable: false`.
 */
export function getAnonymousInfraWithTax(event: H3Event): ServerInfra {
  const runtimeConfig = useRuntimeConfig(event);
  const includeTax = readIncludeTax(event);
  const client = createServerClient(event, { getAccessToken: () => undefined });
  const services = createServices(client);
  return {
    client,
    services,
    user: null,
    language: runtimeConfig.boilerplateDefaultLanguage || 'NL',
    portalMode: readPortalMode(runtimeConfig.boilerplatePortalMode || 'open'),
    currency: runtimeConfig.boilerplateCurrency || '€',
    includeTax,
    cacheable: false,
  };
}

/**
 * Pick the right infra for a listing page rendering prices: authenticated
 * when logged in, anonymous-with-tax when logged out. Always dynamic.
 *
 * `overrides` lets the endpoint inject Tier-2 scope from query params,
 * which beats reading from cookies for the client→server hop: cookies
 * don't always survive Nuxt's `$fetch` dedup pipeline reliably, but
 * query params do — and they make the dependency visible to `useFetch`'s
 * watcher / key derivation.
 */
export async function getListingInfra(
  event: H3Event,
  overrides: { includeTax?: boolean; selectedCompanyId?: number } = {}
): Promise<ServerInfra> {
  const base = hasAuthCookie(event) ? await getServerInfra(event) : getAnonymousInfraWithTax(event);
  if (overrides.includeTax !== undefined) base.includeTax = overrides.includeTax;
  if (overrides.selectedCompanyId !== undefined) base.selectedCompanyId = overrides.selectedCompanyId;
  return base;
}
