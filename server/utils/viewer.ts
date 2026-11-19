import { createHash } from 'node:crypto';

/**
 * Verified viewer lookup: who a Bearer token belongs to, as the upstream API answers it. Upstream
 * accepting the token is the signature check; a token that merely looks like a JWT proves nothing.
 * Cached per sha256(token), bounded, single-flight; a failed lookup is anonymous (fail closed) and
 * not cached. Event-bound wrapper: `verifiedViewer(event, token)` in `server/utils/requestAuth.ts`.
 */

export interface Viewer {
  type: 'Contact' | 'Customer';
  /** contactId or customerId: the `userId` on the viewer's orders. */
  userId: number;
  /** The contact's company, the companies it belongs to and those it has a purchase role in; [] for a customer. */
  companyIds: number[];
  /** Companies the contact is AUTHORIZATION_MANAGER of. */
  managerOf: number[];
}

// ponytail: the first 100 companies / authorization configs; a contact in more is not a storefront case.
export const VIEWER_QUERY = `query proxyViewer {
  viewer {
    __typename
    ... on Contact {
      contactId
      company { companyId }
      companies(input: { page: 1, offset: 100 }) { items { companyId } }
      purchaseAuthorizationConfigs(input: { page: 1, offset: 100 }) { items { purchaseRole company { companyId } } }
    }
    ... on Customer { customerId }
  }
}`;

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** A Viewer from a `VIEWER_QUERY` response's `data.viewer`; null for a guest (`User`) or anything else. */
interface RawViewer {
  __typename?: unknown;
  contactId?: unknown;
  customerId?: unknown;
  company?: { companyId?: unknown } | null;
  companies?: { items?: ({ companyId?: unknown } | null)[] } | null;
  purchaseAuthorizationConfigs?: { items?: ({ purchaseRole?: unknown; company?: { companyId?: unknown } | null } | null)[] } | null;
}

export function parseViewer(raw: unknown): Viewer | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as RawViewer;
  if (v.__typename === 'Customer' && isId(v.customerId)) {
    return { type: 'Customer', userId: v.customerId, companyIds: [], managerOf: [] };
  }
  if (v.__typename !== 'Contact' || !isId(v.contactId)) return null;
  const companyIds = new Set<number>();
  const managerOf = new Set<number>();
  if (isId(v.company?.companyId)) companyIds.add(v.company.companyId);
  for (const company of v.companies?.items ?? []) if (isId(company?.companyId)) companyIds.add(company.companyId);
  for (const pac of v.purchaseAuthorizationConfigs?.items ?? []) {
    const id = pac?.company?.companyId;
    if (!isId(id)) continue;
    companyIds.add(id);
    if (pac?.purchaseRole === 'AUTHORIZATION_MANAGER') managerOf.add(id);
  }
  return { type: 'Contact', userId: v.contactId, companyIds: [...companyIds], managerOf: [...managerOf] };
}

export interface ViewerIdentity {
  userMode: 'anonymous' | 'b2b' | 'b2c';
  contactId: number | null;
  customerId: number | null;
  companyId: number | null;
}

/**
 * Who an analytics event belongs to, from the verified viewer only. The claimed company is kept only
 * when the contact belongs to it (a contact can switch between its companies); otherwise its own.
 */
export function viewerIdentity(viewer: Viewer | null, claimedCompanyId: unknown): ViewerIdentity {
  if (viewer?.type === 'Customer') return { userMode: 'b2c', contactId: null, customerId: viewer.userId, companyId: null };
  if (viewer?.type !== 'Contact') return { userMode: 'anonymous', contactId: null, customerId: null, companyId: null };
  const claimed = Number(claimedCompanyId);
  const companyId = viewer.companyIds.includes(claimed) ? claimed : (viewer.companyIds[0] ?? null);
  return { userMode: 'b2b', contactId: viewer.userId, customerId: null, companyId };
}

export interface ViewerLookupOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export type ViewerLookup = ((token: string | undefined) => Promise<Viewer | null>) & { size: () => number };

/**
 * `fetchViewer(token)` resolves the Viewer (null = upstream says guest or rejects the token, cached)
 * or throws (upstream unreachable or erroring: answered null, not cached).
 */
export function createViewerLookup(
  fetchViewer: (token: string) => Promise<Viewer | null>,
  { ttlMs = 2 * 60_000, maxEntries = 1000, now = Date.now }: ViewerLookupOptions = {},
): ViewerLookup {
  const cache = new Map<string, { at: number; viewer: Viewer | null }>();
  // A page fires several requests at once: they share one lookup per token.
  const inFlight = new Map<string, Promise<Viewer | null>>();

  const lookup = async (key: string, token: string): Promise<Viewer | null> => {
    let viewer: Viewer | null;
    try {
      viewer = await fetchViewer(token);
    } catch {
      return null;
    }
    cache.delete(key);
    cache.set(key, { at: now(), viewer });
    // Oldest first in a Map: drop it once over the limit.
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
    return viewer;
  };

  const get = async (token: string | undefined): Promise<Viewer | null> => {
    if (!token) return null;
    const key = createHash('sha256').update(token).digest('hex');
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.viewer;
    let pending = inFlight.get(key);
    if (!pending) {
      pending = lookup(key, token).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    return pending;
  };
  return Object.assign(get, { size: () => cache.size });
}
