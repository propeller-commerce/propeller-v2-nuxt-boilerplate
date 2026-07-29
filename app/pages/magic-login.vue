<template>
  <div class="min-h-[70vh] flex flex-col items-center justify-center gap-4 py-12 px-4 text-center">
    <ClientOnly>
      <div
        v-if="!failed"
        class="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary"
      />
      <p class="text-muted-foreground">
        {{ failed ? 'This login link is no longer valid. Redirecting…' : 'Signing you in…' }}
      </p>

      <template #fallback>
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
/**
 * Magic-token login entry — `/magic-login?mtoken=<token>` (optional `?redirect=`).
 *
 * Exchanges a backend/ERP-issued token for a session via the package
 * `useAuth().magicLogin`, then runs the shared post-login sequence
 * (`useAfterLogin`) — identical to password login — and redirects. A dead token
 * bounces to `/login?magic_expired=1`. Auth is client-side, so the work runs on
 * mount inside <ClientOnly>.
 */
import { onMounted, ref } from 'vue';
import { useAuth } from '@propeller-commerce/propeller-v2-vue-ui';
import { configuration, localizeHref } from '~/utils/config';
import { useLanguageStore } from '~/stores/language';
import { useAfterLogin } from '~/composables/useAfterLogin';

const router = useRouter();
const route = useRoute();
const { $graphqlClient } = useNuxtApp();
const languageStore = useLanguageStore();
const runAfterLogin = useAfterLogin();
const { magicLogin } = useAuth({ graphqlClient: $graphqlClient as any, configuration });
const failed = ref(false);

onMounted(async () => {
  const token = (route.query.mtoken as string) || '';
  const redirect = (route.query.redirect as string) || '';
  const expired = () => router.replace(`${localizeHref('/login', languageStore.language)}?magic_expired=1`);

  if (!token) {
    failed.value = true;
    expired();
    return;
  }

  // Clear any stale session so the exchange is anonymous (matches the WP flow)
  // and a magic link can hand off to a DIFFERENT contact: drop the httpOnly
  // SSR cookie AND the in-memory SDK client token.
  await $fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
  ($graphqlClient as any).clearAccessToken?.();

  const res = await magicLogin(token);
  if (!res.ok || !res.data.user) {
    failed.value = true;
    expired();
    return;
  }

  const { effectiveLanguage } = await runAfterLogin(
    res.data.user,
    res.data.accessToken,
    res.data.refreshToken,
    res.data.expiresAt,
  );
  router.replace(redirect || localizeHref('/', effectiveLanguage));
});

useHead({ title: 'Signing in…' });
</script>
