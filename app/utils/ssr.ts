/**
 * SSR-safe storage and cookie helpers. Under SSR the Vue app runs in
 * Node where `window`, `document` and `localStorage` do not exist; touching
 * them at module-eval or store-setup time throws.
 *
 * Mirrors propeller-vue/src/lib/ssr.ts.
 */

export const isBrowser = typeof window !== 'undefined';

export const safeStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = isBrowser
  ? window.localStorage
  : {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    };

export function setBrowserCookie(name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 7): void {
  if (!isBrowser) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function deleteBrowserCookie(name: string): void {
  if (!isBrowser) return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}
