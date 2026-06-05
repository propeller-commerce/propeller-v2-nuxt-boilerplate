import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Company } from '@propeller-commerce/propeller-sdk-v2';
import { isBrowser, safeStorage } from '~/utils/ssr';

const STORAGE_KEY = 'selected_company';
const COOKIE_KEY = 'selected_company_id';

function loadCompanyFromStorage(): Company | null {
  try {
    const stored = safeStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Company) : null;
  } catch {
    return null;
  }
}

function writeCompanyCookie(companyId: number | undefined | null): void {
  if (!isBrowser) return;
  if (companyId === undefined || companyId === null) {
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; samesite=lax`;
    return;
  }
  document.cookie = `${COOKIE_KEY}=${companyId}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export const useCompanyStore = defineStore('company', () => {
  const selectedCompany = ref<Company | null>(loadCompanyFromStorage());

  const companyId = computed(() => selectedCompany.value?.companyId ?? null);

  function setSelectedCompany(company: Company) {
    selectedCompany.value = company;
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(company));
    writeCompanyCookie(company.companyId);
    if (isBrowser) {
      window.dispatchEvent(new CustomEvent('companySwitched', { detail: company }));
    }
  }

  function clearSelectedCompany() {
    selectedCompany.value = null;
    safeStorage.removeItem(STORAGE_KEY);
    writeCompanyCookie(undefined);
  }

  function hydrateFromStorage() {
    if (!isBrowser) return;
    const stored = loadCompanyFromStorage();
    if (stored) {
      selectedCompany.value = stored;
      writeCompanyCookie(stored.companyId);
    }
  }

  function hydrateFromServer(company: Company | null) {
    selectedCompany.value = company;
  }

  function syncFromUser(user: unknown): void {
    const u = user as { company?: Company; companies?: { items?: Company[] } } | null;
    if (!u) return;
    const targetId = selectedCompany.value?.companyId;
    const candidates: Company[] = [
      ...(u.companies?.items ?? []),
      ...(u.company ? [u.company] : []),
    ];
    const next =
      (targetId != null && candidates.find((c) => c?.companyId === targetId)) ||
      u.company ||
      null;
    selectedCompany.value = next;
    if (next) safeStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else safeStorage.removeItem(STORAGE_KEY);
    writeCompanyCookie(next?.companyId);
  }

  if (isBrowser) {
    window.addEventListener('companySwitched', (e) => {
      const company = (e as CustomEvent<Company>).detail;
      selectedCompany.value = company;
    });
    window.addEventListener('userLoggedOut', () => clearSelectedCompany());
  }

  return {
    selectedCompany,
    companyId,
    setSelectedCompany,
    clearSelectedCompany,
    hydrateFromStorage,
    hydrateFromServer,
    syncFromUser,
  };
});
