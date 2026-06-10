import { registry } from '~/locales/_registry';
import type { TranslationProvider } from '@propeller-commerce/propeller-v2-vue-ui';

/**
 * Static file-backed translation provider. Reads from the auto-generated
 * `app/locales/_registry.ts` which the build-locales-registry.mjs script
 * produces from `app/locales/<lang>/*.json`.
 */
export function createFileProvider(): TranslationProvider {
  return {
    getNamespace(locale, namespace) {
      const localeKey = locale.toLowerCase();
      const langRegistry = (registry as Record<string, Record<string, Record<string, string>>>)[localeKey];
      if (!langRegistry) return {};
      return langRegistry[namespace] ?? {};
    },
  };
}
