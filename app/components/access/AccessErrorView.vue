<template>
  <div class="propeller-access-error mx-auto max-w-md py-16 px-4 text-center">
    <div
      class="propeller-access-error__icon mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-destructive"
      >
        <template v-if="kind === 'forbidden'">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </template>
        <template v-else-if="kind === 'not-found'">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
          <path d="M8 11h6" />
        </template>
        <template v-else>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </template>
      </svg>
    </div>

    <h1 class="propeller-access-error__title mb-3 text-2xl font-bold tracking-tight">
      {{ title }}
    </h1>
    <p class="propeller-access-error__message mb-8 text-muted-foreground">
      {{ message }}
    </p>

    <div class="propeller-access-error__actions flex flex-col gap-3 sm:flex-row sm:justify-center">
      <a
        v-if="showSignIn"
        :href="localizeHref('/login', languageStore.language)"
        class="inline-flex items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {{ t.signInButton }}
      </a>
      <a
        :href="localizeHref(resolvedBackHref, languageStore.language)"
        :class="
          showSignIn
            ? 'inline-flex items-center justify-center rounded-[var(--radius-control)] border border-input bg-background px-6 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground'
            : 'inline-flex items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90'
        "
      >
        {{ resolvedBackLabel }}
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Friendly error view rendered inside a route when the resource fetch
 * returned 403 / 404 / a generic error. Used by order / quote / quote-request
 * detail pages so users see a translated message instead of a raw GraphQL
 * string like "Forbidden resource".
 *
 * Inline render (same route, no redirect) — mirror of propeller-vue's
 * AccessErrorView.vue.
 */
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { useTranslations } from '~/composables/useTranslations';
import type { ApiErrorKind } from '~/lib/errors';

interface Props {
  kind: ApiErrorKind;
  backHref?: string;
  backLabel?: string;
}

const props = defineProps<Props>();

const authStore = useAuthStore();
const languageStore = useLanguageStore();
const tRef = useTranslations('ErrorPages');
const t = computed(() => tRef.value);

const title = computed(() => {
  if (props.kind === 'forbidden') return t.value.notAuthorizedTitle;
  if (props.kind === 'not-found') return t.value.notFoundTitle;
  return t.value.genericErrorTitle;
});

const message = computed(() => {
  if (props.kind === 'forbidden') return t.value.notAuthorizedMessage;
  if (props.kind === 'not-found') return t.value.notFoundMessage;
  return t.value.genericErrorMessage;
});

const resolvedBackHref = computed(() => {
  if (props.backHref) return props.backHref;
  return props.kind === 'forbidden' || props.kind === 'not-found'
    ? '/account/orders'
    : '/';
});

const resolvedBackLabel = computed(() => {
  if (props.backLabel) return props.backLabel;
  return props.kind === 'forbidden' || props.kind === 'not-found'
    ? t.value.backToOrders
    : t.value.backToHome;
});

// Show a sign-in CTA when the user is unauthenticated AND we got a 403 —
// they may legitimately not have access yet because they're not signed in.
const showSignIn = computed(
  () => props.kind === 'forbidden' && !authStore.isAuthenticated,
);
</script>
