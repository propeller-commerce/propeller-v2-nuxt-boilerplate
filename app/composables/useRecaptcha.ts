import { onMounted } from 'vue';

interface Grecaptcha {
  ready(cb: () => void): void;
  execute(siteKey: string, opts: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let loader: Promise<Grecaptcha> | null = null;

function loadScript(siteKey: string): Promise<Grecaptcha> {
  if (loader) return loader;
  loader = new Promise<Grecaptcha>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.grecaptcha ? resolve(window.grecaptcha) : reject(new Error('grecaptcha missing')));
    script.onerror = () => reject(new Error('reCAPTCHA failed to load'));
    document.head.appendChild(script);
  }).catch((e) => {
    loader = null;
    throw e;
  });
  return loader;
}

/** Lazily loads reCAPTCHA v3 on mount when a site key is set; no-op otherwise. */
export function useRecaptcha() {
  const siteKey = String(useRuntimeConfig().public.recaptchaSiteKey || '');
  const enabled = !!siteKey;

  onMounted(() => {
    if (enabled) loadScript(siteKey).catch(() => {});
  });

  async function getRecaptchaToken(action: string): Promise<string | undefined> {
    if (!enabled || !import.meta.client) return undefined;
    const g = await loadScript(siteKey);
    return new Promise<string>((resolve, reject) => {
      g.ready(() => {
        g.execute(siteKey, { action }).then(resolve, reject);
      });
    });
  }

  return { enabled, getRecaptchaToken };
}
