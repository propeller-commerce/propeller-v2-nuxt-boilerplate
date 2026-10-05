<script setup lang="ts">
import { PropellerProvider } from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { usePriceStore } from '~/stores/price';

// Tier 2 — bind per-scope state (user, company, language, includeTax, portalMode)
// to the routed tree. Tier 1 (graphqlClient, services, currency, configuration)
// is installed by `plugins/propeller.ts`.
const auth = useAuthStore();
const company = useCompanyStore();
const language = useLanguageStore();
const price = usePriceStore();
const config = useRuntimeConfig();

// Only expose a company the signed-in contact actually belongs to. A stale
// `selected_company` left in localStorage by a previously logged-in identity
// would otherwise be sent as companyId before the company store reconciles it —
// and PricingV2 rejects it ("Provided companyId N does not match the contact's
// companies"), erroring the first catalog/parts fetch. Mirrors propeller-next's
// PropellerHostBridge companyId guard.
const validatedCompanyId = computed<number | undefined>(() => {
  const selId = company.companyId ?? undefined;
  const u = auth.user as
    | { company?: { companyId?: number }; companies?: { items?: { companyId?: number }[] } }
    | null;
  // An anonymous request carries no bearer token, so the backend cannot
  // authorize a company-scoped catalog read and rejects it outright. Keep the
  // selection only while a session exists and its profile is still loading.
  if (!u) return auth.token ? selId : undefined;
  const candidates = [...(u.companies?.items ?? []), ...(u.company ? [u.company] : [])];
  if (selId != null && candidates.some((c) => c?.companyId === selId)) return selId;
  return u.company?.companyId ?? undefined;
});

// A `selected_company` from a previous session outlives logout whenever the
// `userLoggedOut` event is missed (expiry, another tab, cleared cookies), and
// then scopes anonymous catalog reads to a company the request cannot
// authorize. Drop it once auth has settled on anonymous.
watch(
  () => [auth.isLoading, auth.token, auth.user, company.companyId] as const,
  ([loading, token, user, selected]) => {
    if (loading || token || user || selected == null) return;
    company.clearSelectedCompany();
  },
  { immediate: true },
);

// Tier-2 scope (companyId / includeTax) flows through useFetch query
// params on the catalog pages, so each page's own watcher re-fetches with
// the new scope. We deliberately don't call refreshNuxtData() here —
// firing it alongside the per-page watchers double-triggers the request
// and the first one gets AbortController-canceled.

// Site-wide title. A function template, not '%s | Name', so a page that sets
// no title of its own renders the site name once rather than "Name | Name".
const siteName = config.public.siteName as string;
useHead({
  title: siteName,
  titleTemplate: (title?: string) =>
    title && title !== siteName ? `${title} | ${siteName}` : siteName,
});
</script>

<template>
  <PropellerProvider
    :user="auth.user ?? null"
    :is-authenticated="!!auth.token"
    :company-id="validatedCompanyId"
    :language="language.language"
    :include-tax="price.includeTax"
    :portal-mode="config.public.portalMode"
  >
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </PropellerProvider>
</template>
