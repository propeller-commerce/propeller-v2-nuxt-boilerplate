import { createFileProvider } from './providers/file';
import type { TranslationProvider } from '@propeller-commerce/propeller-v2-vue-ui';

let _provider: TranslationProvider | null = null;

/**
 * Lazy translation provider singleton. The provider is the seam between
 * the consumer's locale dictionaries and the package's `:labels` prop
 * mechanism — the package only knows how to call `provider.getNamespace(
 * locale, namespace)` and apply the returned map.
 *
 * The file provider reads from `app/locales/_registry.ts` (auto-generated
 * by `scripts/build-locales-registry.mjs`). Swap in a different provider
 * by setting `NUXT_PUBLIC_TRANSLATIONS_PROVIDER` and adding a case below.
 */
export function getTranslationProvider(): TranslationProvider {
  if (_provider) return _provider;
  const which = (process.env.NUXT_PUBLIC_TRANSLATIONS_PROVIDER as string) ?? 'file';
  switch (which) {
    case 'file':
    default:
      _provider = createFileProvider();
  }
  return _provider;
}
