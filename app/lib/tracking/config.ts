/**
 * Tracking configuration.
 *
 * PUSH-based, unlike the propeller-vue twin which resolves the same values at
 * build time from `import.meta.env`. Nuxt does not inline `NUXT_PUBLIC_*` into
 * the client bundle — reading `process.env.NUXT_PUBLIC_X` in client code yields
 * `undefined`, a documented trap in this repo (`nuxt.config.ts`, and the comment
 * in `app/pages/checkout/index.vue`). The values must come from
 * `useRuntimeConfig().public`, which only works inside a Nuxt context.
 *
 * So exactly one caller — `app/plugins/tracking.client.ts` — reads the runtime
 * config and calls `configureTracking()`. Everything downstream (the bus, the
 * emit helpers, the GA4 subscriber) reads it from here and stays callable from
 * stores and router guards, where no Nuxt context exists.
 *
 * Every OTHER file in this directory is byte-identical to propeller-vue's;
 * keeping the difference confined here is the point.
 */

export interface TrackingConfig {
  enabled: boolean;
  ga4Enabled: boolean;
  ga4MeasurementId: string;
  gtmId: string;
  currencyCode: string;
  rootCategoryId: number | null;
}

/**
 * Off until configured. A miswired plugin therefore collects nothing rather
 * than collecting against a half-built context.
 */
const state: TrackingConfig = {
  enabled: false,
  ga4Enabled: false,
  ga4MeasurementId: '',
  gtmId: '',
  currencyCode: 'EUR',
  rootCategoryId: null,
};

export function configureTracking(partial: Partial<TrackingConfig>): void {
  Object.assign(state, partial);
}

export function getTrackingConfig(): TrackingConfig {
  return state;
}

/**
 * A container is configured — push `{event, ecommerce}` rather than calling gtag.
 * The two transports are NOT interchangeable; see `ga4.ts`.
 */
export function isGtmMode(): boolean {
  return state.ga4Enabled && state.gtmId !== '';
}
