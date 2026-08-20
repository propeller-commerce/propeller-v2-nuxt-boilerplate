/**
 * Shared number formatting for /tracker (PWP-910).
 *
 * A plain module rather than a composable: these are constants, and reaching
 * for `useX()` to get an `Intl.NumberFormat` would construct one per component
 * instance for no benefit.
 */

export const nf = new Intl.NumberFormat('en-US');
export const cf = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });

export function fmt(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? nf.format(n) : '—';
}

/** Rows come back from MySQL as plain objects; kept loose on purpose. */
export type Row = Record<string, unknown>;

export const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const asRows = (d: unknown): Row[] => (Array.isArray(d) ? (d as Row[]) : []);

/**
 * Categorical hues, assigned in FIXED order and never cycled by rank — a filter
 * that changes the series count must not repaint the survivors. Defined in
 * `tracker.css` so light/dark swap in one place.
 */
export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
];
