import test from 'node:test';
import assert from 'node:assert/strict';
import { guardFormRequest, isHoneypotFilled, type FormGuardInput } from '../../server/utils/formGuard.ts';
import { createRateLimiter } from '../../server/utils/rateLimit.ts';

const off = { enabled: false, secret: '', minScore: 0.5 };
const on = { enabled: true, secret: 's', minScore: 0.5 };
const rule = { limit: 2, windowMs: 60_000 };
const noFetch = async (): Promise<Response> => { throw new Error('must not call Google'); };

const base = (over: Partial<FormGuardInput> = {}): FormGuardInput => ({
  route: '/api/price-request',
  ip: '1.2.3.4',
  body: {},
  rule,
  limiter: createRateLimiter(() => 0),
  recaptcha: off,
  action: 'price_request',
  fetch: noFetch,
  ...over,
});

test('honeypot: only a non-empty string counts', () => {
  assert.equal(isHoneypotFilled({ website: 'http://spam.example' }), true);
  assert.equal(isHoneypotFilled({ website: '' }), false);
  assert.equal(isHoneypotFilled({ website: '   ' }), false);
  assert.equal(isHoneypotFilled({ website: 1 }), false);
  assert.equal(isHoneypotFilled({}), false);
  assert.equal(isHoneypotFilled(null), false);
});

test('clean request continues', async () => {
  assert.deepEqual(await guardFormRequest(base()), { action: 'continue' });
});

test('filled honeypot is a silent drop, before reCAPTCHA', async () => {
  const res = await guardFormRequest(base({ body: { website: 'x' }, recaptcha: on }));
  assert.deepEqual(res, { action: 'drop' });
});

test('rate limit counts every request, even invalid ones, and wins over the honeypot', async () => {
  const limiter = createRateLimiter(() => 0);
  await guardFormRequest(base({ limiter, body: null }));
  await guardFormRequest(base({ limiter, body: { website: 'x' } }));
  const res = await guardFormRequest(base({ limiter, body: { website: 'x' } }));
  assert.deepEqual(res, { action: 'reject', status: 429, error: 'rate_limited', retryAfter: 60 });
});

test('rate limit is keyed by route and ip', async () => {
  const limiter = createRateLimiter(() => 0);
  await guardFormRequest(base({ limiter }));
  await guardFormRequest(base({ limiter }));
  assert.equal((await guardFormRequest(base({ limiter, ip: '5.6.7.8' }))).action, 'continue');
  assert.equal((await guardFormRequest(base({ limiter, route: '/api/other' }))).action, 'continue');
});

test('enabled reCAPTCHA without a token is rejected', async () => {
  const res = await guardFormRequest(base({ recaptcha: on, body: {} }));
  assert.deepEqual(res, { action: 'reject', status: 400, error: 'captcha_failed' });
});

test('enabled reCAPTCHA passes the token, ip and action to Google', async () => {
  let params: URLSearchParams | null = null;
  const res = await guardFormRequest(base({
    recaptcha: on,
    body: { recaptchaToken: 'tok' },
    fetch: async (_u, init) => {
      params = new URLSearchParams(String(init?.body));
      return new Response(JSON.stringify({ success: true, score: 0.9, action: 'price_request' }));
    },
  }));
  assert.deepEqual(res, { action: 'continue' });
  assert.equal(params!.get('response'), 'tok');
  assert.equal(params!.get('remoteip'), '1.2.3.4');
});

test('Google down fails closed with 503', async () => {
  const res = await guardFormRequest(base({
    recaptcha: on,
    body: { recaptchaToken: 'tok' },
    fetch: async () => new Response('', { status: 502 }),
  }));
  assert.deepEqual(res, { action: 'reject', status: 503, error: 'captcha_unavailable' });
});

test('disabled reCAPTCHA ignores the token field', async () => {
  const res = await guardFormRequest(base({ body: { recaptchaToken: 'garbage' } }));
  assert.deepEqual(res, { action: 'continue' });
});
