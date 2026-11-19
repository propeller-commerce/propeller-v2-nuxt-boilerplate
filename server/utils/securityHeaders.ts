/**
 * Security headers for every response (#9), set by `server/middleware/security-headers.ts`. The
 * policy mirrors propeller-next's production CSP (proxy.ts): `script-src` keeps 'unsafe-inline'
 * because Nuxt's inline `window.__NUXT__` config script needs it (a nonce-based CSP is a separate,
 * open boilerplate task); frames: `frame-ancestors 'none'` plus X-Frame-Options DENY.
 */

export interface CspOptions {
  /** `nuxt dev`: Vite HMR needs eval and a websocket. */
  dev: boolean;
  /** reCAPTCHA v3 site key set: Google's script and challenge frame. */
  recaptcha: boolean;
  /** GA4 / GTM on: googletagmanager.com serves gtag.js and the container. */
  ga: boolean;
}

export function contentSecurityPolicy({ dev, recaptcha, ga }: CspOptions): string {
  const extraScript = `${ga ? ' https://www.googletagmanager.com' : ''}${recaptcha ? ' https://www.google.com https://www.gstatic.com' : ''}`;
  return [
    "default-src 'self'",
    `img-src 'self' data: https:${dev ? ' http:' : ''}`,
    // app/assets/css/app.css imports a Google Fonts stylesheet (Dancing Script).
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}${extraScript}`,
    dev ? "connect-src 'self' ws: wss: https: http:" : "connect-src 'self' https:",
    // Product videos (vue-ui ProductVideos) embed YouTube / Vimeo.
    `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com${recaptcha ? ' https://www.google.com' : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function securityHeaders(opts: CspOptions): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(opts),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // HSTS only in production; dev runs on http://localhost.
    ...(opts.dev ? {} : { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }),
  };
}

/**
 * The same policy with one more form target: the punchout transfer page auto-posts the cart to the
 * buyer's (validated) procurement system, which `form-action 'self'` would block.
 */
export function allowFormTarget(csp: string, origin: string): string {
  return csp.replace("form-action 'self'", `form-action 'self' ${origin}`);
}
