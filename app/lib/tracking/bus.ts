import { track as busTrack, tracker } from './tracker.ts';
import { getTrackingConfig } from './config.ts';
import type { EventName } from './taxonomy.ts';
import type { TrackingContext } from './types';

/**
 * The browser-only facade over the event bus.
 *
 * A plain module on purpose — not a Pinia store, not a composable:
 *
 *   - it has to be callable from store actions and router guards, where no
 *     component instance exists;
 *   - it has to be callable from `entry-client.ts` before Pinia is even created;
 *   - a `reactive()` proxy over a 20-event queue and a dedupe Map is pure
 *     overhead, and makes the dedupe map observable for no reason.
 *
 * ── Why the SSR guard lives HERE and not in tracker.ts ──────────────────────
 *
 * `tracker.ts` buffers events until `setContext()` lands. On the server that
 * never happens and no subscriber is ever registered, so every server-side
 * `track()` appends to a module-scope array that is never drained. In a single
 * long-lived Node process that is unbounded growth, and a cross-request data
 * leak the moment anything does drain it.
 *
 * Guarding at the facade means the bundler sees `import.meta.env.SSR` as a
 * compile-time constant and eliminates the body outright, so the bus's state is
 * *unreachable* on the server rather than merely unused. `tracker.ts` itself
 * stays byte-identical to propeller-next's copy, so future syncs are a diff.
 */

/**
 * True in the browser. `import.meta.client` is a compile-time literal in Nuxt.
 *
 * Deliberately NOT `import.meta.env.SSR`, which is what the propeller-vue twin
 * uses: it is not reliably compile-time-constant under Nitro, so using it here
 * would silently reinstate the server-side buffer leak this guard exists to
 * prevent — and nothing would fail loudly.
 */
const isBrowser = import.meta.client;

/**
 * Emit an event. Never throws — analytics must not affect the user flow, an
 * invariant analytics code must always hold.
 *
 * `name` is the taxonomy union rather than `string`. The ingest silently DROPS
 * an unrecognised name, so a typo costs a metric with no error anywhere — which
 * is exactly how `propeller.address_default_changed` survived here. The shared
 * `tracker.ts` core keeps `string` because it is byte-identical across the three
 * storefronts; narrowing at this facade is what gives every call site in this
 * app a compile-time check.
 */
export function track(name: EventName, props: Record<string, unknown> = {}, key?: string): void {
  if (!isBrowser) return;
  if (!getTrackingConfig().enabled) return;
  try {
    busTrack(name, props, key);
  } catch {
    /* ignore — a broken analytics call must not break the page */
  }
}

/** Publish the resolved identity. Drains everything buffered before this point. */
export function setTrackingContext(context: TrackingContext): void {
  if (!isBrowser) return;
  try {
    tracker.setContext(context);
  } catch {
    /* ignore */
  }
}

/** Register a sink. Returns an unsubscribe function. */
export function subscribeTracking(fn: Parameters<typeof tracker.subscribe>[0]): () => void {
  if (!isBrowser) return () => {};
  return tracker.subscribe(fn);
}

/** Drop context and buffered events — used on logout. */
export function resetTracking(): void {
  if (!isBrowser) return;
  tracker.reset();
}
