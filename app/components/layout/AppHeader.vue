<template>
  <!-- Top Info Bar — outside sticky header, scrolls away naturally -->
  <div
    v-if="topBarEnabled"
    data-topbar
    class="relative h-10"
    style="background: #242526"
  >
    <div class="container-width h-full">
      <div class="flex items-center justify-between h-full text-xs font-medium text-white">
        <!-- Left: Phone + Announcement -->
        <div class="flex items-center gap-4">
          <div v-if="topBarPhone" class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span>{{ topBarPhone }}</span>
          </div>
          <span v-if="topBarAnnouncement" class="hidden sm:inline text-white/80">
            {{ topBarAnnouncement }}
          </span>
        </div>

        <!-- Right: Company Switcher + VAT Toggle + Language Switcher -->
        <div class="flex items-center gap-4">
          <ClientOnly>
            <CompanySwitcher
              v-if="isContactWithMultipleCompanies"
              :selectedCompanyId="companyStore.companyId ?? undefined"
              :onCompanyChange="handleCompanyChange"
              :labels="companySwitcherLabels"
            />

            <PriceToggle
              v-if="showVatToggle"
              :includeTax="priceStore.includeTax"
              :onToggle="(val: boolean) => priceStore.setIncludeTax(val)"
              :inclExclVatSwitched="(val: boolean) => priceStore.setIncludeTax(val)"
              :language="languageStore.language"
              :labels="priceToggleLabels"
            />
          </ClientOnly>

          <div v-if="showLanguageSwitcher && availableLanguages.length > 1" ref="langMenuRef" class="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              :aria-expanded="showLangMenu"
              aria-label="Select language"
              class="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium hover:bg-white/10 transition-colors"
              @click="toggleLangMenu"
            >
              <Globe class="w-3.5 h-3.5" />
              <span>{{ activeLanguage }}</span>
              <ChevronDown :class="['w-3 h-3 transition-transform', showLangMenu ? 'rotate-180' : '']" />
            </button>
            <div
              v-if="showLangMenu"
              role="listbox"
              class="absolute right-0 top-full mt-2 z-[60] min-w-[10rem] rounded border border-border bg-card text-foreground shadow-lg overflow-hidden"
            >
              <button
                v-for="lang in availableLanguages"
                :key="lang"
                type="button"
                role="option"
                :aria-selected="activeLanguage === lang.toUpperCase()"
                :class="[
                  'w-full flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-left transition-colors',
                  activeLanguage === lang.toUpperCase()
                    ? 'bg-primary/5 text-primary'
                    : 'hover:bg-muted',
                ]"
                @click="selectLanguage(lang)"
              >
                <span>{{ lang.toUpperCase() }}</span>
                <Check v-if="activeLanguage === lang.toUpperCase()" class="w-4 h-4 text-primary" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <header ref="headerRef" class="w-full z-50 bg-background shadow-sm sticky top-0">
    <!-- Middle Section (dark bar) -->
    <div style="background-color: #242526">
      <div class="container-width">
        <div class="flex items-center justify-between h-16 sm:h-20 gap-4 sm:gap-8">
          <!-- Mobile hamburger -->
          <button
            type="button"
            class="md:hidden text-white p-2 -ml-2"
            @click="showMobileMenu = !showMobileMenu"
          >
            <svg v-if="showMobileMenu" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
            <MenuIcon v-else class="w-6 h-6 text-white" />
          </button>

          <!-- Logo -->
          <NuxtLink :to="localizeHref('/', languageStore.language)" class="flex-shrink-0 relative h-10 sm:h-12 w-auto flex items-center">
            <img
              v-if="logoSrc"
              :src="logoSrc"
              :alt="logoAlt"
              class="h-full w-auto object-contain"
            />
            <span v-else class="font-bold text-xl text-white">{{ siteName }}</span>
          </NuxtLink>

          <!-- Search Bar (desktop only) -->
          <div v-if="showSearch" class="propeller-header-search flex-1 max-w-2xl">
            <ClientOnly>
              <SearchBar
                :onSubmit="handleSearch"
                :onViewAllClick="handleSearch"
                :onResultClick="(result: { url?: string }) => { if (result?.url) router.push(result.url) }"
                :clearSignal="searchClearSignal"
                :labels="searchBarLabels"
              />
            </ClientOnly>
          </div>

          <!-- Right Section -->
          <div class="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <ClientOnly>
              <AccountIconAndMenu
                v-if="showAccount"
                :cart="cartStore.cart as Cart"
                :afterLogin="handleAfterLogin"
                :onMenuItemClick="(href: string) => router.push(href)"
                :onLogoutClick="handleLogout"
                :onForgotPasswordClick="() => router.push(localizeHref('/forgot-password', languageStore.language))"
                :onRegisterClick="() => router.push(localizeHref('/register', languageStore.language))"
                :accountHeaderLoginForm="true"
                :menuLinks="accountMenuLinks"
                iconClassName="text-white hover:text-white hover:bg-white/10"
                :labels="accountIconAndMenuLabels"
                :loginFormLabels="loginFormLabels"
              />

              <CartIconAndSidebar
                v-if="showCart"
                :cart="cartStore.cart as Cart"
                :cartCheckoutButton="true"
                :onCheckoutButtonClick="() => router.push(localizeHref('/checkout', languageStore.language))"
                :onCartPageButtonClick="() => router.push(localizeHref('/cart', languageStore.language))"
                :onRequestQuoteClick="() => router.push(localizeHref('/checkout?mode=quote', languageStore.language))"
                :afterRequestAuthorization="handleAfterRequestAuthorization"
                :onError="(err: Error) => console.error('Authorization request failed:', err)"
                :showTotals="true"
                iconClassName="text-white hover:text-white hover:bg-white/10"
                :labels="cartIconAndSidebarLabels"
              />
            </ClientOnly>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Navigation — desktop only -->
    <div class="hidden md:block border-t border-border bg-background h-12">
      <div class="container-width h-full">
        <nav class="flex items-center h-full">
          <!-- Categories Dropdown (hover-triggered) -->
          <div
            v-if="showCategoriesMenu"
            ref="mainMenuRef"
            class="relative h-full"
            @mouseleave="showMainMenu = false"
          >
            <button
              type="button"
              class="h-full flex items-center gap-2 px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors border-l border-r border-transparent hover:border-border"
              @mouseenter="showMainMenu = true"
            >
              <MenuIcon class="w-5 h-5" />
              <span>{{ categoriesMenuLabel }}</span>
            </button>

            <div
              :class="['absolute left-0 top-full z-50', showMainMenu ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none h-0 overflow-hidden']"
            >
              <ClientOnly>
                <PropellerMenu
                  :categoryId="configuration.baseCategoryId"
                  :depth="configuration.menuDepth"
                  :tree="menuTreeProp"
                  :onMenuItemClick="handleCategoryClick"
                  menuStyle="dropdown-vertical"
                  :labels="menuLabels"
                />
              </ClientOnly>
            </div>
          </div>

          <!-- Horizontal nav links -->
          <div :class="['flex items-center gap-6 text-sm font-medium text-muted-foreground', showCategoriesMenu ? 'ml-6' : 'ml-0']">
            <NuxtLink
              v-for="link in navLinks"
              :key="link.url"
              :to="localizeHref(link.url, languageStore.language)"
              :class="['hover:text-foreground transition-colors', link.highlight ? 'text-destructive' : '']"
            >
              {{ link.label }}
            </NuxtLink>
          </div>
        </nav>
      </div>
    </div>

    <!-- Mobile slide-down menu -->
    <div v-if="showMobileMenu" class="md:hidden bg-background border-t border-border overflow-y-auto max-h-[calc(100vh-64px)]">
      <!-- Mobile search -->
      <div v-if="showSearch" class="p-4 border-b border-border">
        <ClientOnly>
          <SearchBar
            :onSubmit="(term: string) => { showMobileMenu = false; handleSearch(term) }"
            :onViewAllClick="(term: string) => { showMobileMenu = false; handleSearch(term) }"
            :onResultClick="(result: { url?: string }) => { showMobileMenu = false; if (result?.url) router.push(result.url) }"
            :clearSignal="searchClearSignal"
            :labels="searchBarLabels"
          />
        </ClientOnly>
      </div>

      <ClientOnly>
        <PropellerMenu
          v-if="showCategoriesMenu"
          :categoryId="configuration.baseCategoryId"
          :depth="configuration.menuDepth"
          :tree="menuTreeProp"
          :onMenuItemClick="handleCategoryClick"
          menuStyle="dropdown-vertical"
          :labels="menuLabels"
        />
      </ClientOnly>

      <!-- Mobile nav links -->
      <div class="border-t border-border divide-y divide-border">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.url"
          :to="localizeHref(link.url, languageStore.language)"
          :class="['block px-4 py-3 text-sm font-medium text-foreground', link.highlight ? 'text-destructive' : '']"
          @click="showMobileMenu = false"
        >
          {{ link.label }}
        </NuxtLink>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Menu as MenuIcon, ChevronDown, Check, Globe } from 'lucide-vue-next';
import { PurchaseRole } from '@propeller-commerce/propeller-sdk-v2';
import type { Cart, Category, Company, Contact, Customer } from '@propeller-commerce/propeller-sdk-v2';
import type { MenuCategory } from '@propeller-commerce/propeller-v2-vue-ui/shared';
import {
  AccountIconAndMenu,
  CartIconAndSidebar,
  CompanySwitcher,
  Menu as PropellerMenu,
  PriceToggle,
  SearchBar,
  useCart,
  type AnyUser,
} from '@propeller-commerce/propeller-v2-vue-ui';
import { useAuthStore } from '~/stores/auth';
import { useCartStore } from '~/stores/cart';
import { useCompanyStore } from '~/stores/company';
import { usePriceStore } from '~/stores/price';
import { useLanguageStore } from '~/stores/language';
import { configuration, localizeHref, stripLanguagePrefix, detectLanguageFromPath } from '~/utils/config';
import { restoreManagerCart } from '~/utils/cartHelpers';
import { useTranslations } from '~/composables/useTranslations';

interface Props {
  menuTree?: MenuCategory[];
}
const props = withDefaults(defineProps<Props>(), { menuTree: () => [] });

const router = useRouter();
const route = useRoute();
const runtimeConfig = useRuntimeConfig();

const authStore = useAuthStore();
const cartStore = useCartStore();
const companyStore = useCompanyStore();
const priceStore = usePriceStore();
const languageStore = useLanguageStore();

// Company-scoped cart re-fetch, used by handleCompanyChange. Mirrors the
// useCart wiring in login.vue / register.vue and propeller-vue's AppHeader.
const { $graphqlClient } = useNuxtApp();
const { fetchActiveCart } = useCart({
  graphqlClient: $graphqlClient as any,
  user: computed(() => authStore.user as AnyUser),
  companyId: computed(() => companyStore.selectedCompany?.companyId ?? undefined),
  language: computed(() => languageStore.language),
  configuration,
});

const menuTreeProp = computed<MenuCategory[] | undefined>(() =>
  props.menuTree.length ? props.menuTree : undefined
);

const companySwitcherLabels = useTranslations('CompanySwitcher');
const priceToggleLabels = useTranslations('PriceToggle');
const searchBarLabels = useTranslations('SearchBar');
const accountIconAndMenuLabels = useTranslations('AccountIconAndMenu');
const loginFormLabels = useTranslations('LoginForm');
const cartIconAndSidebarLabels = useTranslations('CartIconAndSidebar');
const menuLabels = useTranslations('Menu');

const headerRef = ref<HTMLElement | null>(null);
const mainMenuRef = ref<HTMLDivElement | null>(null);
const showMainMenu = ref(false);
const showMobileMenu = ref(false);
const langMenuRef = ref<HTMLDivElement | null>(null);
const showLangMenu = ref(false);

const activeLanguage = computed(() => detectLanguageFromPath(route.path));

function toggleLangMenu() {
  showLangMenu.value = !showLangMenu.value;
}
function selectLanguage(lang: string) {
  switchLanguage(lang);
  showLangMenu.value = false;
}
function handleLangClickOutside(event: MouseEvent) {
  if (langMenuRef.value && !langMenuRef.value.contains(event.target as Node)) {
    showLangMenu.value = false;
  }
}
function handleLangKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') showLangMenu.value = false;
}
watch(showLangMenu, (open) => {
  if (typeof document === 'undefined') return;
  if (open) {
    document.addEventListener('mousedown', handleLangClickOutside);
    document.addEventListener('keydown', handleLangKeydown);
  } else {
    document.removeEventListener('mousedown', handleLangClickOutside);
    document.removeEventListener('keydown', handleLangKeydown);
  }
});

// Header chrome flags. Replace with a CMS store when integration lands.
const topBarEnabled = ref(true);
const topBarPhone = ref('');
const topBarAnnouncement = ref('');
const showVatToggle = ref(true);
const showLanguageSwitcher = ref(true);
const availableLanguages = ref(['EN', 'NL']);
const showSearch = ref(true);
const showAccount = ref(true);
const showCart = ref(true);
const showCategoriesMenu = ref(true);
const categoriesMenuLabel = ref('Browse Categories');
// Contact-only: the machines section reads the contact's MY_INSTALLATIONS, so
// the nav entry only appears for a logged-in contact. Mirrors propeller-next's
// Header `isContact` gate.
const isContact = computed(() => !!(authStore.user && 'contactId' in authStore.user));
const navLinks = computed(() => {
  const links = [
    { label: 'Blog', url: '/blog', highlight: false },
    { label: 'New Arrivals', url: '/new-arrivals', highlight: false },
    { label: 'Sale', url: '/sale', highlight: true },
  ];
  if (isContact.value) {
    links.unshift({ label: 'Machines', url: '/machines', highlight: false });
  }
  return links;
});

const siteName = (runtimeConfig.public.siteName as string | undefined) || 'Propeller Shop';
const logoSrc = (runtimeConfig.public.logoUrl as string | undefined) || '';
const logoAlt = (runtimeConfig.public.logoAlt as string | undefined) || siteName;

const isContactWithMultipleCompanies = computed(() => {
  const user = authStore.user;
  return !!(
    user &&
    'contactId' in user &&
    (user as Contact).companies &&
    ((user as Contact).companies!.items?.length || 0) > 1
  );
});

const isAuthManagerForCurrentCompany = computed(() =>
  authStore.isAuthManagerForCompany(authStore.user, companyStore.companyId ?? undefined)
);

const accountMenuLinks = computed(() => {
  const lang = languageStore.language;
  const links = [
    { label: 'Dashboard', href: localizeHref('/account', lang) },
    { label: 'Addresses', href: localizeHref('/account/addresses', lang) },
    { label: 'Orders', href: localizeHref('/account/orders', lang) },
    { label: 'Quotes', href: localizeHref('/account/quotes', lang) },
    { label: 'Quote requests', href: localizeHref('/account/quote-requests', lang) },
    { label: 'Favorites', href: localizeHref('/account/favorites', lang) },
  ];
  if (isAuthManagerForCurrentCompany.value) {
    links.push(
      { label: 'Authorization settings', href: localizeHref('/account/authorization-settings', lang) },
      { label: 'Authorization requests', href: localizeHref('/account/authorization-requests', lang) }
    );
  }
  return links;
});

async function handleAfterLogin(
  user: Contact | Customer,
  accessToken?: string,
  refreshToken?: string
) {
  authStore.setUser(user);
  if (accessToken) authStore.setToken(accessToken);

  const contactCompany = (user as Contact).company;
  if (contactCompany?.companyId) {
    companyStore.setSelectedCompany(contactCompany);
  }

  // Mirror the token into the httpOnly cookie for the next SSR request.
  if (accessToken) {
    await $fetch('/api/auth/session', {
      method: 'POST',
      body: { accessToken, refreshToken },
    }).catch(() => {});
  }

  router.push(localizeHref('/account', languageStore.language));
}

async function handleCompanyChange(company: Company) {
  // Setting the company writes the cookie + bumps the reactive companyId.
  // The catalog pages' useFetch watchers pick that up and re-fetch on
  // their own — no refreshNuxtData() here (it would race the watcher and
  // cancel the in-flight request).
  companyStore.setSelectedCompany(company);
  // The cart is company-scoped: re-fetch the new company's active cart so the
  // sidebar and `cartStore.cartId` track the switch. Without this, cartId stays
  // stale/empty after switching and the next add-to-cart — e.g. a spare part on
  // /machines — has no cart to attach to. Mirrors propeller-vue's AppHeader.
  if (authStore.user) {
    const newCart = await fetchActiveCart();
    cartStore.setCart(newCart ?? null);
  }
}

function handleAfterRequestAuthorization(cart: Cart) {
  // Mirror the checkout/cart-page handlers: if a manager parked their own
  // cart to act on this request, hand it back; otherwise clear. Without
  // this the user submits the auth request from the header sidebar, the
  // package's CartSummary fires this callback, and the stale cart stays
  // in localStorage — the sidebar keeps showing items that no longer
  // belong to a live cart.
  cartStore.setCart(restoreManagerCart());
  router.push(localizeHref(`/authorization-request-sent/${cart.cartId}`, languageStore.language));
}

function handleSearch(term: string) {
  // Query-style (?q=foo) is the canonical search URL. Path-style
  // (/search/foo/bar) exists only as a legacy alias that redirects here
  // via pages/search/[...term].vue.
  const path = localizeHref('/search', languageStore.language);
  router.push(term ? { path, query: { q: term } } : path);
}

const searchClearSignal = ref(0);
watch(
  () => route.path,
  (newPath, oldPath) => {
    if (newPath === oldPath) return;
    const onSearchRoute = stripLanguagePrefix(newPath).startsWith('/search');
    if (!onSearchRoute) searchClearSignal.value++;
  }
);

function switchLanguage(lang: string) {
  languageStore.setLanguage(lang);
  const canonical = stripLanguagePrefix(route.path);
  const target = localizeHref(canonical, lang);
  router.push({ path: target, query: route.query, hash: route.hash });
}

function handleCategoryClick(category: Category) {
  showMainMenu.value = false;
  showMobileMenu.value = false;
  router.push(configuration.urls.getCategoryUrl(category, languageStore.language));
}

function handleLogout() {
  authStore.logout();
  cartStore.setCart(null);
  router.push(localizeHref('/', languageStore.language));
}
</script>
