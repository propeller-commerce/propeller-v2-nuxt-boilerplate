/**
 * Server-cookie-aware auth guard for /account/* pages.
 *
 * On the server: read the httpOnly `access_token` cookie via H3. Its
 * presence alone counts as authenticated for the redirect decision — the
 * full user payload hydrates client-side from localStorage.
 *
 * On the client: read the Pinia auth store.
 *
 * Wire via `definePageMeta({ middleware: 'auth' })` on each account page,
 * or set on the parent layout (Nuxt picks layout middleware up too).
 */
import { getCookie } from 'h3';
import { useAuthStore } from '~/stores/auth';
import { localizeHref } from '~/utils/config';
import { useLanguageStore } from '~/stores/language';

export default defineNuxtRouteMiddleware((to) => {
  const language = useLanguageStore();
  const loginPath = localizeHref('/login', language.language);

  if (import.meta.server) {
    const event = useRequestEvent();
    if (!event) return;
    const token = getCookie(event, 'access_token');
    if (!token) {
      return navigateTo({ path: loginPath, query: { redirect: to.fullPath } });
    }
    return;
  }

  const auth = useAuthStore();
  if (!auth.isAuthenticated) {
    return navigateTo({ path: loginPath, query: { redirect: to.fullPath } });
  }
});
