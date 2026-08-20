/**
 * useAfterLogin — the shared post-authentication sequence (Nuxt).
 *
 * Extracted from `app/pages/login.vue`'s `handleLoginSuccess` so password login
 * AND magic-token login run the identical flow: persist user + tokens (authStore
 * + localStorage + httpOnly session cookie via /api/auth/session), select the
 * company, switch language, and reconcile the cart (fetch active → merge
 * anonymous → drop the anonymous cart). Returns the resolved `effectiveLanguage`;
 * the caller owns the final redirect (login → /account, magic-login → /).
 */

import { computed } from 'vue'
import { CartService } from '@propeller-commerce/propeller-sdk-v2'
import type { Cart, Contact, Customer } from '@propeller-commerce/propeller-sdk-v2'
import { mergeAnonymousCart, useCart, type AnyUser } from '@propeller-commerce/propeller-v2-vue-ui'
import { useAuthStore } from '~/stores/auth'
import { useCartStore } from '~/stores/cart'
import { useCompanyStore } from '~/stores/company'
import { useLanguageStore } from '~/stores/language'
import { configuration } from '~/utils/config'
import { track } from '~/lib/tracking/bus'
import { refreshTrackingContext, trackIdentify } from '~/lib/tracking/bootstrap'

export function useAfterLogin() {
  const { $graphqlClient } = useNuxtApp()
  const graphqlClient = $graphqlClient as any
  const authStore = useAuthStore()
  const cartStore = useCartStore()
  const companyStore = useCompanyStore()
  const languageStore = useLanguageStore()

  const { fetchActiveCart, resolveCart } = useCart({
    graphqlClient,
    user: computed(() => authStore.user as AnyUser),
    companyId: computed(() => companyStore.selectedCompany?.companyId ?? undefined),
    language: computed(() => languageStore.language),
    configuration,
  })

  return async function afterLogin(
    user: Contact | Customer,
    accessToken?: string,
    refreshToken?: string,
    expiresAt?: string,
    anonymousCart?: Cart | null,
    /** How the session was authenticated — 'password' or 'magic_token'. */
    method: string = 'password',
  ): Promise<{ effectiveLanguage: string }> {
    authStore.setUser(user)
    if (accessToken) {
      authStore.setToken(accessToken)
    }
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
    if (expiresAt) localStorage.setItem('expiresAt', expiresAt)

    window.dispatchEvent(new CustomEvent('userLoggedIn'))

    const contactCompany = (user as Contact).company
    if (contactCompany?.companyId) {
      companyStore.setSelectedCompany(contactCompany)
    }

    // Mirror token + refresh into httpOnly cookies for SSR.
    if (accessToken) {
      await $fetch('/api/auth/session', {
        method: 'POST',
        body: { accessToken, refreshToken },
      }).catch(() => {})
    }

    const userLang = (user as { primaryLanguage?: string }).primaryLanguage
    if (userLang && userLang !== languageStore.language) {
      languageStore.setLanguage(userLang)
    }

    let targetCart = await fetchActiveCart()

    if (anonymousCart?.items?.length) {
      if (!targetCart) {
        targetCart = await resolveCart()
      }
      const merged = await mergeAnonymousCart({
        graphqlClient,
        targetCartId: targetCart.cartId,
        anonymousCart,
        language: languageStore.language,
        imageSearchFilters: configuration.imageSearchFiltersGrid,
        imageVariantFilters: configuration.imageVariantFiltersSmall,
      })
      if (merged) targetCart = merged

      if (anonymousCart.cartId && anonymousCart.cartId !== targetCart.cartId) {
        try {
          await new CartService(graphqlClient).deleteCart({ id: anonymousCart.cartId })
        } catch (e) {
          console.error('[auth] Failed to delete anonymous cart', e)
        }
      }
    }

    cartStore.setCart(targetCart ?? null)

    // Emitted HERE, explicitly, and never from a `watch(isAuthenticated)`: that
    // watcher runs with `{ immediate: true }` on every store construction, so it
    // would report a login on every page load of an already-signed-in visitor.
    track('login', { method }, `login:${method}:${Date.now()}`)
    // Re-publish scope so everything after this point carries the contact,
    // company and mode — the bootstrap's snapshot was taken while anonymous.
    refreshTrackingContext()
    const contactId = (user as Contact).contactId ?? null
    trackIdentify({
      userMode: contactId != null ? 'b2b' : 'b2c',
      contactId,
      customerId: contactId != null ? null : ((user as Customer).customerId ?? null),
      companyId: companyStore.selectedCompany?.companyId ?? null,
      language: languageStore.language?.slice(0, 2).toUpperCase() ?? null,
    })

    return { effectiveLanguage: userLang || languageStore.language }
  }
}
