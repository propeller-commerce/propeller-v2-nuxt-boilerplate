import { securityHeaders } from '../utils/securityHeaders';

/**
 * CSP, frame, sniffing and referrer headers on every response (#9): pages, API routes and errors
 * alike, so no path shape can miss them. A route may override one afterwards (punchout transfer).
 */
let headers: Record<string, string> | undefined;

export default defineEventHandler((event) => {
  if (!headers) {
    const pub = useRuntimeConfig(event).public;
    headers = securityHeaders({
      dev: !!import.meta.dev,
      recaptcha: !!String(pub.recaptchaSiteKey || '').trim(),
      ga: String(pub.useGa4 || '') === 'true',
    });
  }
  setResponseHeaders(event, headers);
});
