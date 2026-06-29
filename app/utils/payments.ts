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
 * Configured via `NUXT_PUBLIC_ON_ACCOUNT_PAYMENTS` (comma-separated,
 * case-insensitive). Defaults to `REKENING,ON_ACCOUNT` when unset. The checkout
 * page imports this to decide the placement order status + whether to start a
 * Mollie payment.
 *
 * Env access is via `process.env.NUXT_PUBLIC_*` (Nuxt inlines these into both
 * the server and client bundles) — the same convention `app/utils/config.ts`
 * uses, mirroring the Vue consumer's `import.meta.env.VITE_*`. The server route
 * applies the same rule against the server-only `ON_ACCOUNT_PAYMENTS` (via
 * `server/utils/mollie.ts`) as a defense-in-depth guard; keep the two in sync.
 */

const DEFAULT_ON_ACCOUNT = ['REKENING', 'ON_ACCOUNT'];

/** Parse the configured on-account method codes, upper-cased and trimmed. */
export function onAccountMethods(): string[] {
  const raw = process.env.NUXT_PUBLIC_ON_ACCOUNT_PAYMENTS || '';
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
export function isOnAccountMethod(method: string | undefined | null): boolean {
  if (!method) return false;
  return onAccountMethods().includes(method.trim().toUpperCase());
}

/** Whether Mollie is the active payment provider, per the client env mirror. */
export function isMollieEnabled(): boolean {
  return (process.env.NUXT_PUBLIC_PAYMENT_PROVIDER || '').trim().toLowerCase() === 'mollie';
}
