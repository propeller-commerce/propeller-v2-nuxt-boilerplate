/**
 * Payment-method classification — client side.
 *
 * The Nuxt mirror of `propeller-vue/frontend/src/lib/payments.ts` and
 * `propeller-next/lib/payments.ts`. "On-account" methods (e.g. REKENING,
 * ON_ACCOUNT) are settled outside the PSP — the order is placed straight to NEW
 * with no Mollie hand-off. Every other method goes through Mollie, where the
 * order starts as UNFINISHED and the webhook later promotes it based on the
 * Mollie payment state.
 *
 * ── IMPORTANT (Nuxt env gotcha) ──────────────────────────────────────────────
 * Unlike Vite's `import.meta.env.VITE_*` (Vue) — which is statically inlined
 * into the client bundle — Nuxt does NOT inline `process.env.NUXT_PUBLIC_*` into
 * the browser bundle. There `process.env` is an empty shim, so a `process.env.
 * NUXT_PUBLIC_*` read evaluates to `undefined` at runtime and every value falls
 * back to its default. Public runtime config must be read via
 * `useRuntimeConfig().public.*` instead. These helpers therefore take the
 * resolved public-config object from the caller (which is in Nuxt app context)
 * rather than reading the env themselves.
 *
 * The server route applies the same on-account rule against the server-only
 * `ON_ACCOUNT_PAYMENTS` (via `server/utils/mollie.ts`, which reads
 * `useRuntimeConfig(event)` correctly) as a defense-in-depth guard; keep the
 * two in sync.
 */

const DEFAULT_ON_ACCOUNT = ['REKENING', 'ON_ACCOUNT'];

/** The shape of `useRuntimeConfig().public` this module reads. */
export interface PaymentsPublicConfig {
  paymentProvider?: string;
  onAccountPayments?: string;
}

/** Parse the configured on-account method codes, upper-cased and trimmed. */
export function onAccountMethods(pub: PaymentsPublicConfig): string[] {
  const raw = pub.onAccountPayments || '';
  const list = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ON_ACCOUNT;
}

/**
 * Whether a payment-method code settles "on account" (no PSP). Comparison is
 * case-insensitive. Used to decide both the placement order status (on-account →
 * NEW; PSP → UNFINISHED until the webhook resolves it) and whether to start a
 * Mollie payment at all.
 */
export function isOnAccountMethod(pub: PaymentsPublicConfig, method: string | undefined | null): boolean {
  if (!method) return false;
  return onAccountMethods(pub).includes(method.trim().toUpperCase());
}

/**
 * The active PSP slug from the public runtime config's `paymentProvider` —
 * `'mollie'` | `'multisafepay'` | `null` (no PSP). Only one PSP is active at a
 * time. The slug also picks the host route base (`pspApiBase`) and the `?psp=`
 * return marker. Mirrors propeller-vue / propeller-next `activePspProvider`.
 */
export type PspProvider = 'mollie' | 'multisafepay';

export function activePspProvider(pub: PaymentsPublicConfig): PspProvider | null {
  const p = (pub.paymentProvider || '').trim().toLowerCase();
  return p === 'mollie' || p === 'multisafepay' ? p : null;
}

/** API route base for a PSP: mollie → `/api/mollie`, multisafepay → `/api/msp`. */
export function pspApiBase(provider: PspProvider): string {
  return provider === 'multisafepay' ? '/api/msp' : '/api/mollie';
}

/** sessionStorage key the checkout stashes the PSP payment id under, per order. */
export function pspStashKey(provider: PspProvider, orderId: number | string): string {
  return `${provider}_payment_${orderId}`;
}

/**
 * Whether Mollie specifically is the active provider. Thin wrapper over
 * `activePspProvider`, kept for backward compatibility with existing callers.
 */
export function isMollieEnabled(pub: PaymentsPublicConfig): boolean {
  return activePspProvider(pub) === 'mollie';
}
