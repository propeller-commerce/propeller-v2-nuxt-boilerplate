import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecaptchaSettings, verifyRecaptcha, RECAPTCHA_VERIFY_URL } from '../../server/utils/recaptcha.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const settings = { enabled: true, secret: 'sek', minScore: 0.5 };

test('settings: enabled only when both keys are set', () => {
  assert.equal(getRecaptchaSettings({ secret: 's', siteKey: '' }).enabled, false);
  assert.equal(getRecaptchaSettings({ secret: '', siteKey: 'k' }).enabled, false);
  assert.equal(getRecaptchaSettings({ secret: '  ', siteKey: 'k' }).enabled, false);
  assert.deepEqual(getRecaptchaSettings({ secret: 's', siteKey: 'k' }), { enabled: true, secret: 's', minScore: 0.5 });
});

test('settings: min score parses, falls back to 0.5', () => {
  assert.equal(getRecaptchaSettings({ secret: 's', siteKey: 'k', minScore: '0.7' }).minScore, 0.7);
  assert.equal(getRecaptchaSettings({ secret: 's', siteKey: 'k', minScore: 'abc' }).minScore, 0.5);
  assert.equal(getRecaptchaSettings({ secret: 's', siteKey: 'k', minScore: '' }).minScore, 0.5);
});

test('disabled: passes without calling Google', async () => {
  let called = false;
  const res = await verifyRecaptcha({
    settings: { enabled: false, secret: '', minScore: 0.5 },
    token: undefined,
    action: 'price_request',
    fetch: async () => { called = true; return json({}); },
  });
  assert.deepEqual(res, { ok: true });
  assert.equal(called, false);
});

test('missing token → 400 captcha_failed without calling Google', async () => {
  let called = false;
  for (const token of [undefined, '', 42]) {
    const res = await verifyRecaptcha({
      settings, token, action: 'price_request',
      fetch: async () => { called = true; return json({}); },
    });
    assert.deepEqual(res, { ok: false, status: 400, error: 'captcha_failed' });
  }
  assert.equal(called, false);
});

test('posts form-encoded secret, response and remoteip', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const res = await verifyRecaptcha({
    settings, token: 'tok', remoteip: '9.9.9.9', action: 'price_request',
    fetch: async (url, init) => {
      seen = { url: String(url), init: init! };
      return json({ success: true, score: 0.9, action: 'price_request' });
    },
  });
  assert.deepEqual(res, { ok: true });
  assert.equal(seen!.url, RECAPTCHA_VERIFY_URL);
  assert.equal(RECAPTCHA_VERIFY_URL, 'https://www.google.com/recaptcha/api/siteverify');
  assert.equal(seen!.init.method, 'POST');
  const params = new URLSearchParams(String(seen!.init.body));
  assert.equal(params.get('secret'), 'sek');
  assert.equal(params.get('response'), 'tok');
  assert.equal(params.get('remoteip'), '9.9.9.9');
  assert.match(String((seen!.init.headers as Record<string, string>)['Content-Type']), /x-www-form-urlencoded/);
});

test('score at the threshold passes', async () => {
  const res = await verifyRecaptcha({
    settings, token: 't', action: 'price_request',
    fetch: async () => json({ success: true, score: 0.5, action: 'price_request' }),
  });
  assert.deepEqual(res, { ok: true });
});

test('success false, low score, wrong or missing action → 400 captcha_failed', async () => {
  for (const body of [
    { success: false, 'error-codes': ['invalid-input-response'] },
    { success: true, score: 0.4, action: 'price_request' },
    { success: true, action: 'price_request' },
    { success: true, score: 0.9, action: 'contact' },
    { success: true, score: 0.9 },
    { success: 'true', score: 0.9, action: 'price_request' },
  ]) {
    const res = await verifyRecaptcha({ settings, token: 't', action: 'price_request', fetch: async () => json(body) });
    assert.deepEqual(res, { ok: false, status: 400, error: 'captcha_failed' }, JSON.stringify(body));
  }
});

test('non-2xx, network error, bad JSON → 503 captcha_unavailable', async () => {
  const fetches = [
    async () => json({ success: true, score: 1, action: 'price_request' }, 500),
    async () => { throw new TypeError('fetch failed'); },
    async () => new Response('not json', { status: 200 }),
  ];
  for (const f of fetches) {
    const res = await verifyRecaptcha({ settings, token: 't', action: 'price_request', fetch: f });
    assert.deepEqual(res, { ok: false, status: 503, error: 'captcha_unavailable' });
  }
});

test('timeout → 503 captcha_unavailable', async () => {
  const res = await verifyRecaptcha({
    settings, token: 't', action: 'price_request', timeoutMs: 20,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  });
  assert.deepEqual(res, { ok: false, status: 503, error: 'captcha_unavailable' });
});
