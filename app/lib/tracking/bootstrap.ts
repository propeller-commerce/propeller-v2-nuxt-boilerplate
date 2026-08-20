import { track, setTrackingContext, subscribeTracking, resetTracking } from './bus.ts';
import { getTrackingConfig, isGtmMode } from './config.ts';
import { batchTo } from './batch.ts';
import { ga4Subscriber } from './ga4.ts';
import { classifyRoute, stripLocalePrefix } from './pageType.ts';
import type { TrackingContext, UserMode } from './types';
import type { Router } from 'vue-router';

/**
 * Client bootstrap for the tracking bus (PWP-910).
 *
 * The propeller-next twin of this file is a null-rendering React component
 * (`components/tracking/TrackingBridge.tsx`) because that is how it gets at
 * context. Here the stores are reachable directly, so this is a plain function,
 * called once from `app/plugins/tracking.client.ts`.
 *
 * Byte-identical to the propeller-vue copy — nothing in it is Vite- or
 * Nitro-specific. The `import.meta.client` / `import.meta.env.SSR` difference
 * lives one level down in `bus.ts`, and the config difference in `config.ts`.
 *
 * Runs AFTER `hydrate-stores`, so the published context carries a real company
 * id: the `__NUXT__` payload restores server-rendered nulls over whatever the
 * store factories read from localStorage, and `hydrate-stores` is what puts
 * cart/company/auth back. Events fired before that point are not lost: `tracker.ts`
 * buffers everything until `setContext` lands and flushes on arrival. That
 * buffer is the reason this must NOT be hoisted "so nothing is missed" — it
 * would only stamp an anonymous context on the first page of every session.
 */

const SESSION_KEY = 'pr_sid';
const SESSION_IDLE_MS = 30 * 60 * 1000;
/**
 * How long to wait for auth before publishing anonymous context. Without a
 * fallback a backend that never answers strands the buffer and NOTHING is
 * tracked at all — verified in propeller-next against a 403ing backend.
 */
const AUTH_GRACE_MS = 2000;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * A 30-minute sliding session, held in `sessionStorage`.
 *
 * NOT in the auth store and NOT in `safeStorage`: `logout()` calls
 * `safeStorage.clear()`, which would hand every logout a brand-new session and
 * double-count the visit. `sessionStorage` is out of its reach, and so is the
 * `pr_vid` cookie the server mints.
 */
function resolveSessionId(): string {
  if (typeof window === 'undefined') return '';
  const now = Date.now();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; at: number };
      if (parsed?.id && now - parsed.at < SESSION_IDLE_MS) {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, at: now }));
        return parsed.id;
      }
    }
  } catch {
    /* private mode — fall through to a fresh id */
  }
  const id = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
  } catch {
    /* ignore */
  }
  return id;
}

export interface IdentitySnapshot {
  userMode: UserMode;
  contactId: number | null;
  customerId: number | null;
  companyId: number | null;
  language: string | null;
}

function buildContext(snapshot: IdentitySnapshot, channelId: number): TrackingContext {
  return {
    channelId,
    userMode: snapshot.userMode,
    contactId: snapshot.contactId,
    customerId: snapshot.customerId,
    companyId: snapshot.companyId,
    visitorId: readCookie('pr_vid') ?? '',
    sessionId: resolveSessionId(),
    language: snapshot.language,
    currency: getTrackingConfig().currencyCode,
  };
}

/**
 * Loads Google's tag. Imperative rather than a rendered `<script>`: a script tag
 * in SSR markup that the client re-renders is a hydration mismatch, and GTM's
 * own snippet does `appendChild` anyway.
 */
function injectGoogleTag(): void {
  const { ga4MeasurementId, gtmId } = getTrackingConfig();
  const first = document.getElementsByTagName('script')[0];
  const w = window as unknown as { dataLayer: unknown[] };
  w.dataLayer = w.dataLayer || [];

  if (isGtmMode()) {
    w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const gtm = document.createElement('script');
    gtm.async = true;
    gtm.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    first?.parentNode?.insertBefore(gtm, first);
    return;
  }

  const gtag = document.createElement('script');
  gtag.async = true;
  gtag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`;
  first?.parentNode?.insertBefore(gtag, first);

  const push = (...args: unknown[]) => w.dataLayer.push(args);
  push('js', new Date());
  // `send_page_view: false` — we emit `page_viewed` ourselves per route. Leaving
  // it on double-counts the first page of every session, and Google's automatic
  // one would miss client-side navigations regardless.
  push('config', ga4MeasurementId, { send_page_view: false });
}

/**
 * One `session_started` per session, not per page load. The bus's dedupe map is
 * module-scope and resets on reload; session identity has to outlive that.
 */
function trackSessionStart(): void {
  const sid = resolveSessionId();
  if (!sid) return;
  try {
    const flag = `pr_ss:${sid}`;
    if (window.sessionStorage.getItem(flag)) return;
    window.sessionStorage.setItem(flag, '1');
  } catch {
    /* private mode: accept a possible repeat */
  }
  track(
    'session_started',
    { entry_path: window.location.pathname, referrer: document.referrer || null },
    `session_started:${sid}`
  );
}

/**
 * `identify` is the join row that lets a sink retro-attribute an anonymous
 * history to the account — without it the ids on later events say nothing about
 * the weeks before the login, which is the interesting part.
 */
export function trackIdentify(snapshot: IdentitySnapshot): void {
  const userId = snapshot.contactId ?? snapshot.customerId;
  if (userId == null) return;
  const visitorId = readCookie('pr_vid') ?? '';
  track(
    'identify',
    {
      visitor_id: visitorId,
      user_id: userId,
      user_type: snapshot.userMode,
      company_id: snapshot.companyId,
    },
    `identify:${visitorId}:${snapshot.userMode}:${userId}`
  );
}

let publishContext: ((snapshot: IdentitySnapshot) => void) | null = null;
let readIdentity: (() => IdentitySnapshot) | null = null;

/**
 * Re-publish identity after a login, logout or company switch. A no-op before
 * `startTracking` has run, which is exactly the SSR case.
 */
export function refreshTrackingContext(): void {
  if (!publishContext || !readIdentity) return;
  publishContext(readIdentity());
}

/** Drop identity and buffered events. Called on logout. */
export function clearTrackingIdentity(): void {
  resetTracking();
}

export interface StartTrackingOptions {
  router: Router;
  channelId: number;
  identity: () => IdentitySnapshot;
}

export function startTracking({ router, channelId, identity }: StartTrackingOptions): void {
  const config = getTrackingConfig();
  if (!config.enabled) return;

  // Subscribers are independent: GA4 throwing on a malformed event cannot stop
  // the row reaching `/api/track`, and vice versa — the bus isolates them.
  subscribeTracking(batchTo('/api/track'));
  if (config.ga4Enabled) {
    subscribeTracking(ga4Subscriber());
    injectGoogleTag();
  }

  readIdentity = identity;
  publishContext = (snapshot) => setTrackingContext(buildContext(snapshot, channelId));

  let identified = false;
  const publish = () => {
    const snapshot = identity();
    publishContext!(snapshot);
    if (!identified && (snapshot.contactId != null || snapshot.customerId != null)) {
      identified = true;
      trackIdentify(snapshot);
    }
  };

  publish();
  // Auth may still be resolving. Re-publishing once the grace period is up is
  // idempotent, and covers the case where `refreshUser()` lands late.
  window.setTimeout(publish, AUTH_GRACE_MS);

  trackSessionStart();

  const emitPageView = (name: unknown, params: Record<string, unknown>, path: string) => {
    const hit = classifyRoute(name as string, params);
    if (!hit) return;
    const stripped = stripLocalePrefix(path);
    track(
      'page_viewed',
      {
        page_type: hit.pageType,
        entity_type: hit.entityId ? hit.pageType : null,
        entity_id: hit.entityId,
        path: stripped,
      },
      `page_viewed:${hit.pageType}:${hit.entityId ?? stripped}`
    );
  };

  // The router is already resting on the hydrated route, so `afterEach` will not
  // fire for it. Emitting it explicitly first is the difference between correct
  // landing-page numbers and under-counting by exactly one per session.
  const current = router.currentRoute.value;
  emitPageView(current.name, current.params as Record<string, unknown>, current.path);
  router.afterEach((to) => emitPageView(to.name, to.params as Record<string, unknown>, to.path));
}
