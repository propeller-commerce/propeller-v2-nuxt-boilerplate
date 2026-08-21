import type { Cart } from '@propeller-commerce/propeller-sdk-v2';
import { isBrowser, safeStorage } from '~/utils/ssr';

/**
 * Restore the manager's own cart after they finish acting on a requester's
 * authorization cart. Mirrors propeller-vue's `restoreManagerCart`.
 */
export function restoreManagerCart(): Cart | null {
  if (!isBrowser) return null;
  const parked = safeStorage.getItem('manager_cart');
  if (!parked) return null;
  safeStorage.removeItem('manager_cart');
  try {
    return JSON.parse(parked) as Cart;
  } catch {
    return null;
  }
}

/** Park the current cart so the manager can come back to it after handling an authorization request. */
export function parkManagerCart(cart: Cart | null): void {
  if (!isBrowser || !cart) return;
  try {
    safeStorage.setItem('manager_cart', JSON.stringify(cart));
  } catch {
    // ignore quota errors
  }
}
