import { useAuthStore } from '~/stores/auth';
import { useCompanyStore } from '~/stores/company';
import { useLanguageStore } from '~/stores/language';
import { configureTracking } from '~/lib/tracking/config';
import { startTracking } from '~/lib/tracking/bootstrap';

/**
 * The one place a Nuxt context is read for tracking (PWP-910).
 *
 * `useRuntimeConfig()` only works inside a Nuxt context, and
 * `process.env.NUXT_PUBLIC_*` is `undefined` in the client bundle — a documented
 * trap in this repo. So the values are read once here and PUSHED into
 * `lib/tracking/config`, which every other module reads synchronously. That is
 * what keeps the bus callable from store actions and router guards, where no
 * context exists.
 *
 * `.client` on purpose: the whole bus is browser-only. See `bus.ts` for why the
 * SSR guard is at the facade rather than in `tracker.ts`.
 */
export default defineNuxtPlugin({
  name: 'tracking',
  // Both halves are load-bearing and both are existing scars in this repo:
  // `pinia` because `useAuthStore()` throws without an active instance, and
  // `hydrate-stores` because it is what restores cart/company from localStorage
  // after the `__NUXT__` payload clobbers them. Bootstrapping ahead of it makes
  // `session_started` and `identify` carry a null companyId on every cold load.
  dependsOn: ['pinia', 'hydrate-stores'],
  setup() {
    const runtime = useRuntimeConfig();
    const pub = runtime.public;

    // Strings compared to 'true', never real booleans: Nuxt's NUXT_* override
    // only coerces when the default's type matches, so a boolean default here
    // changes behaviour between `nuxt dev` and `node .output/server`. Same
    // posture as `paymentProvider` / `mollieTestMode`.
    const ga4Key = String(pub.ga4Key ?? '').trim();
    configureTracking({
      enabled: String(pub.trackingEnabled ?? '') === 'true',
      ga4Enabled: String(pub.useGa4 ?? '') === 'true' && ga4Key !== '',
      ga4MeasurementId: ga4Key,
      gtmId: String(pub.gtmKey ?? '').trim(),
      currencyCode: String(pub.currencyCode ?? 'EUR').trim() || 'EUR',
      rootCategoryId: Number(pub.baseCategoryId) || null,
    });

    // Resolved against the app's Pinia instance explicitly, exactly like
    // `hydrate-stores.client.ts` — `dependsOn` alone has proved unreliable for
    // plugin ordering on a cold dev start in this repo.
    const pinia = usePinia();
    const auth = useAuthStore(pinia);
    const company = useCompanyStore(pinia);
    const language = useLanguageStore(pinia);

    startTracking({
      router: useRouter(),
      channelId: Number(pub.channelId) || 1,
      identity: () => {
        const user = auth.user as { contactId?: number; customerId?: number } | null;
        const contactId = user && 'contactId' in user ? (user.contactId ?? null) : null;
        const customerId = user && !('contactId' in user) ? (user.customerId ?? null) : null;
        return {
          userMode: !user ? 'anonymous' : contactId != null ? 'b2b' : 'b2c',
          contactId,
          customerId,
          companyId: company.selectedCompany?.companyId ?? null,
          language: language.language?.slice(0, 2).toUpperCase() ?? null,
        };
      },
    });
  },
});
