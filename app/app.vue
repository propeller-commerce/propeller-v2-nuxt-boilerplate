<script setup lang="ts">
import { PropellerProvider } from 'propeller-v2-vue-ui';
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

// Tier-2 scope (companyId / includeTax) flows through useFetch query
// params on the catalog pages, so each page's own watcher re-fetches with
// the new scope. We deliberately don't call refreshNuxtData() here —
// firing it alongside the per-page watchers double-triggers the request
// and the first one gets AbortController-canceled.
</script>

<template>
  <PropellerProvider
    :user="auth.user ?? null"
    :company-id="company.companyId ?? undefined"
    :language="language.language"
    :include-tax="price.includeTax"
    :portal-mode="config.public.portalMode"
  >
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </PropellerProvider>
</template>
