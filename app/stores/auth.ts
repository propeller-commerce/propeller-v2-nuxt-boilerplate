import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { type Contact, type Customer, PurchaseRole } from '@propeller-commerce/propeller-sdk-v2';
import { isBrowser, safeStorage, setBrowserCookie, deleteBrowserCookie } from '~/utils/ssr';

type User = Contact | Customer;

function sanitizeUser(data: unknown): User {
  const strip = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(strip);
    if (typeof obj === 'object') {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        r[k.startsWith('_') ? k.slice(1) : k] = strip(v);
      }
      return r;
    }
    return obj;
  };
  return strip(data) as User;
}

function loadUserFromStorage(): User | null {
  try {
    const stored = safeStorage.getItem('user') || safeStorage.getItem('auth_user');
    if (!stored) return null;
    return sanitizeUser(JSON.parse(stored));
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(loadUserFromStorage());
  const token = ref<string | null>(safeStorage.getItem('accessToken') || safeStorage.getItem('auth_token'));
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  let sessionTimer: ReturnType<typeof setTimeout> | null = null;
  const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

  function resetSessionTimer() {
    if (!isAuthenticated.value) return;
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
      console.log('Session expired due to inactivity');
      logout();
    }, 30 * 60 * 1000);
  }

  const handleActivity = () => resetSessionTimer();

  watch(
    isAuthenticated,
    (authenticated) => {
      if (!isBrowser) return;
      if (authenticated) {
        activityEvents.forEach((e) => window.addEventListener(e, handleActivity));
        resetSessionTimer();
      } else {
        if (sessionTimer) clearTimeout(sessionTimer);
        activityEvents.forEach((e) => window.removeEventListener(e, handleActivity));
      }
    },
    { immediate: true }
  );

  function setUser(u: User | null) {
    const clean = u ? sanitizeUser(u) : null;
    user.value = clean;
    if (clean) safeStorage.setItem('user', JSON.stringify(clean));
    else safeStorage.removeItem('user');
    safeStorage.removeItem('auth_user');
  }

  function setToken(t: string | null) {
    token.value = t;
    if (t) {
      safeStorage.setItem('accessToken', t);
      // Mirror the token into a cookie so server fetchers see it on the
      // next SSR navigation. The /api/auth/session endpoint sets an
      // httpOnly variant on login; this read-only mirror lets the client
      // SDK reattach the Bearer header without a /api round-trip.
      setBrowserCookie('access_token', t);
    } else {
      safeStorage.removeItem('accessToken');
      safeStorage.removeItem('auth_token');
      deleteBrowserCookie('access_token');
    }
  }

  function clearError() {
    error.value = null;
  }

  function updateUser(userData: Partial<User>) {
    if (!user.value) return;
    user.value = { ...user.value, ...userData } as User;
    safeStorage.setItem('user', JSON.stringify(user.value));
  }

  function logout() {
    user.value = null;
    token.value = null;
    error.value = null;

    const menuData = safeStorage.getItem('menuData');
    safeStorage.clear();
    if (menuData) safeStorage.setItem('menuData', menuData);

    deleteBrowserCookie('access_token');

    if (isBrowser) {
      window.dispatchEvent(new CustomEvent('userLoggedOut'));
      // Also hit the server endpoint to drop the httpOnly cookies.
      fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    }
  }

  function isAuthManagerForCompany(u: Contact | Customer | null, companyId: number | undefined): boolean {
    if (!u || !companyId || !('contactId' in u)) return false;
    type PacEntry = { purchaseRole?: PurchaseRole; _purchaseRole?: PurchaseRole; company?: { companyId?: number; _companyId?: number }; _company?: { companyId?: number; _companyId?: number } };
    const pacData = (u as unknown as { purchaseAuthorizationConfigs?: { items?: PacEntry[]; _items?: PacEntry[] } }).purchaseAuthorizationConfigs;
    const items: PacEntry[] = pacData?.items ?? pacData?._items ?? [];
    return items.some((pac) => {
      const role = pac.purchaseRole ?? pac._purchaseRole;
      const pacCompanyId =
        pac.company?.companyId ?? pac.company?._companyId ?? pac._company?.companyId ?? pac._company?._companyId;
      return role === PurchaseRole.AUTHORIZATION_MANAGER && pacCompanyId === companyId;
    });
  }

  if (isBrowser) {
    window.addEventListener('userLoggedIn', () => {
      const storedToken = safeStorage.getItem('accessToken');
      const storedUser = safeStorage.getItem('user');
      if (storedToken && storedUser) {
        try {
          user.value = sanitizeUser(JSON.parse(storedUser));
          token.value = storedToken;
        } catch (e) {
          console.error('Failed to parse stored user on userLoggedIn event:', e);
        }
      }
    });

    window.addEventListener('userLoggedOut', () => {
      user.value = null;
      token.value = null;
    });
  }

  /**
   * Seed the store from SSR-resolved viewer payload. Called by page loaders
   * that already ran `getServerInfra()`. Writes no storage/cookie — only
   * the in-memory refs.
   */
  function hydrateFromServer(u: User | null, t: string | null) {
    user.value = u ? sanitizeUser(u) : null;
    token.value = t;
  }

  /**
   * Re-fetch the full viewer from the backend and replace `user.value` with
   * the fresh result. Use after any mutation that changes the viewer payload
   * (address CRUD, company switch, profile update). Mirrors propeller-next's
   * `AuthContext.refreshUser`.
   *
   * Client-only: server-side, the viewer is seeded at SSR boot from the
   * cookie (see `server/plugins/seed-auth.ts`) — there's no second pass
   * during render.
   */
  async function refreshUser(): Promise<void> {
    if (!isBrowser) return;
    try {
      const nuxtApp = useNuxtApp();
      const services = nuxtApp.$services as { user?: { getViewer: (args: object) => Promise<unknown> } } | undefined;
      const viewer = await services?.user?.getViewer({});
      if (viewer) {
        const clean = sanitizeUser(viewer) as User;
        user.value = clean;
        safeStorage.setItem('user', JSON.stringify(clean));
        window.dispatchEvent(new CustomEvent('userRefreshed', { detail: { user: clean } }));
      }
    } catch (e) {
      console.error('refreshUser failed:', e);
    }
  }

  return {
    user,
    token,
    isLoading,
    error,
    isAuthenticated,
    setUser,
    setToken,
    clearError,
    updateUser,
    logout,
    isAuthManagerForCompany,
    hydrateFromServer,
    refreshUser,
  };
});
