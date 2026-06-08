<script setup lang="ts">
import { computed } from 'vue';
import { AccountIconAndMenu } from 'propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';
import { useTranslations } from '~/composables/useTranslations';

const auth = useAuthStore();
const company = useCompanyStore();
const language = useLanguageStore();
const router = useRouter();
const route = useRoute();

const accountIconAndMenuLabels = useTranslations('AccountIconAndMenu');
const loginFormLabels = useTranslations('LoginForm');

const currentPath = computed(() => '/' + route.path.replace(/^\//, ''));

// Delegate the auth-manager check to the auth store. The store reads the
// real SDK schema (purchaseAuthorizationConfigs.items[].purchaseRole) — the
// older local version checked non-existent `roles` / `companyRoles` fields
// and always returned false, hiding the manager-only menu items.
const isAuthManagerForCompany = computed(() =>
  auth.isAuthManagerForCompany(auth.user, company.companyId ?? undefined)
);

// All hrefs go through localizeHref so they pick up the current language
// prefix (NL stays unprefixed, EN becomes /en/account/...). The computed
// depends on languageStore.language so the menu re-renders when switching.
const menuLinks = computed(() => {
  const lang = language.language;
  return [
    { label: 'Dashboard', href: localizeHref('/account', lang) },
    { label: 'Addresses', href: localizeHref('/account/addresses', lang) },
    { label: 'Orders', href: localizeHref('/account/orders', lang) },
    { label: 'Quotes', href: localizeHref('/account/quotes', lang) },
    { label: 'Quote requests', href: localizeHref('/account/quote-requests', lang) },
    { label: 'Favorites', href: localizeHref('/account/favorites', lang) },
    { label: 'Invoices', href: localizeHref('/account/invoices', lang) },
    { label: 'Price requests', href: localizeHref('/account/price-requests', lang) },
    ...(isAuthManagerForCompany.value
      ? [
          { label: 'Authorization settings', href: localizeHref('/account/authorization-settings', lang) },
          { label: 'Authorization requests', href: localizeHref('/account/authorization-requests', lang) },
        ]
      : []),
  ];
});

function handleMenuItemClick(href: string) {
  // The href already carries the language prefix from menuLinks above, so
  // router.push receives the canonical path directly — no second wrap needed.
  router.push(href);
}

async function handleLogout() {
  auth.logout();
  await router.push(localizeHref('/login', language.language));
}
</script>

<template>
  <aside class="w-full lg:w-72 flex-shrink-0">
    <div class="overflow-hidden border border-border bg-card shadow-sm rounded-[var(--radius-container)] sticky top-24">
      <ClientOnly>
        <AccountIconAndMenu
          variant="sidebar"
          :currentPath="currentPath"
          :onMenuItemClick="handleMenuItemClick"
          :onLogoutClick="handleLogout"
          :menuLinks="menuLinks"
          :labels="accountIconAndMenuLabels"
          :loginFormLabels="loginFormLabels"
        />
      </ClientOnly>
    </div>
  </aside>
</template>
