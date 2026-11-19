import test from 'node:test';
import assert from 'node:assert/strict';
import { allowFormTarget, contentSecurityPolicy, securityHeaders } from '../../server/utils/securityHeaders.ts';

const PROD = { dev: false, recaptcha: false, ga: false };

const directives = (csp: string) => new Map(csp.split('; ').map((d) => [d.split(' ')[0], d] as const));

test('production policy: same as Next, framing refused, inline scripts for the Nuxt payload', () => {
  const csp = directives(contentSecurityPolicy(PROD));
  assert.equal(csp.get('script-src'), "script-src 'self' 'unsafe-inline'");
  assert.equal(csp.get('frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(csp.get('form-action'), "form-action 'self'");
  assert.equal(csp.get('connect-src'), "connect-src 'self' https:");
  const headers = securityHeaders(PROD);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.ok(headers['Strict-Transport-Security']);
});

test('reCAPTCHA and GA add only their own sources; dev adds eval, websockets and no HSTS', () => {
  const csp = directives(contentSecurityPolicy({ dev: false, recaptcha: true, ga: true }));
  assert.match(csp.get('script-src')!, /https:\/\/www\.googletagmanager\.com https:\/\/www\.google\.com https:\/\/www\.gstatic\.com$/);
  assert.match(csp.get('frame-src')!, /https:\/\/www\.google\.com$/);
  const dev = directives(contentSecurityPolicy({ dev: true, recaptcha: false, ga: false }));
  assert.match(dev.get('script-src')!, /'unsafe-eval'/);
  assert.match(dev.get('connect-src')!, /ws:/);
  assert.equal(securityHeaders({ ...PROD, dev: true })['Strict-Transport-Security'], undefined);
});

test('the punchout transfer page may post to the validated hook origin, nothing else changes', () => {
  const csp = contentSecurityPolicy(PROD);
  const transfer = allowFormTarget(csp, 'https://erp.example.test');
  assert.equal(directives(transfer).get('form-action'), "form-action 'self' https://erp.example.test");
  assert.equal(transfer.replace(" https://erp.example.test", ''), csp);
});
