<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { localizeHref } from '~/utils/config';

const auth = useAuthStore();
const company = useCompanyStore();
const language = useLanguageStore();
const route = useRoute();
const router = useRouter();

const isAuthManager = computed(() =>
  auth.isAuthManagerForCompany(auth.user, company.companyId ?? undefined)
);

interface Link {
  label: string;
  href: string;
}

const links = computed<Link[]>(() => {
  const base: Link[] = [
    { label: 'Dashboard', href: '/account' },
    { label: 'Addresses', href: '/account/addresses' },
    { label: 'Orders', href: '/account/orders' },
    { label: 'Quotes', href: '/account/quotes' },
    { label: 'Quote requests', href: '/account/quote-requests' },
    { label: 'Favorites', href: '/account/favorites' },
    { label: 'Invoices', href: '/account/invoices' },
    { label: 'Price requests', href: '/account/price-requests' },
  ];
  if (isAuthManager.value) {
    base.push(
      { label: 'Authorization settings', href: '/account/authorization-settings' },
      { label: 'Authorization requests', href: '/account/authorization-requests' }
    );
  }
  return base;
});

function isActive(href: string): boolean {
  const path = route.path;
  if (href === '/account') return path === '/account' || path === localizeHref('/account', language.language);
  return path === localizeHref(href, language.language) || path.startsWith(localizeHref(href, language.language));
}

function go(href: string) {
  router.push(localizeHref(href, language.language));
}

async function logout() {
  auth.logout();
  await router.push(localizeHref('/login', language.language));
}
</script>

<template>
  <aside class="w-full lg:w-72 flex-shrink-0">
    <div class="border rounded-lg bg-card overflow-hidden sticky top-24">
      <ul class="divide-y">
        <li v-for="link in links" :key="link.href">
          <button
            type="button"
            class="w-full text-left px-4 py-3 hover:bg-muted"
            :class="{ 'font-semibold bg-muted/50': isActive(link.href) }"
            @click="go(link.href)"
          >
            {{ link.label }}
          </button>
        </li>
        <li>
          <button
            type="button"
            class="w-full text-left px-4 py-3 hover:bg-muted text-destructive"
            @click="logout"
          >
            Logout
          </button>
        </li>
      </ul>
    </div>
  </aside>
</template>
