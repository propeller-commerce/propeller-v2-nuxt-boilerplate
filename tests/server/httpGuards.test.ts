import test from 'node:test';
import assert from 'node:assert/strict';
import { cookieToken, errorSummary, isSameOrigin, isSameOriginJson, safeEqual } from '../../server/utils/httpGuards.ts';

const JSON_TYPE = 'application/json; charset=utf-8';

test('same origin: the request host, x-forwarded-host or the site URL; no Origin is a non-browser client', () => {
  assert.equal(isSameOrigin({ origin: 'http://127.0.0.1:5001', host: '127.0.0.1:5001' }), true);
  assert.equal(isSameOrigin({ origin: 'https://shop.test', host: 'localhost:5000', forwardedHost: 'shop.test' }), true);
  assert.equal(isSameOrigin({ origin: 'https://shop.test', host: 'localhost:5000' }, 'https://shop.test/'), true);
  assert.equal(isSameOrigin({ host: 'shop.test' }), true);
});

test('a different, opaque or malformed Origin is refused', () => {
  assert.equal(isSameOrigin({ origin: 'https://evil.test', host: 'shop.test' }, 'https://shop.test'), false);
  assert.equal(isSameOrigin({ origin: 'null', host: 'shop.test' }), false);
  assert.equal(isSameOrigin({ origin: 'https://shop.test.evil.test', host: 'shop.test' }), false);
  assert.equal(isSameOrigin({ origin: 'http://shop.test:8080', host: 'shop.test' }), false, 'port is part of the host');
});

test('JSON variant: only application/json, and the Origin rule on top', () => {
  assert.equal(isSameOriginJson({ origin: 'https://shop.test', host: 'shop.test', contentType: JSON_TYPE }), true);
  assert.equal(isSameOriginJson({ host: 'shop.test', contentType: 'application/json' }), true, 'missing Origin');
  for (const contentType of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x', '', null]) {
    assert.equal(isSameOriginJson({ host: 'shop.test', contentType }), false, String(contentType));
  }
  assert.equal(isSameOriginJson({ origin: 'https://evil.test', host: 'shop.test', contentType: JSON_TYPE }), false);
});

test('safeEqual compares whole strings of any length', () => {
  assert.equal(safeEqual('s3cret', 's3cret'), true);
  assert.equal(safeEqual('s3cret', 's3cre'), false);
  assert.equal(safeEqual('', 'x'), false);
});

test('errorSummary keeps the type and codes, never the message', () => {
  const smtp = Object.assign(new Error('550 mailbox unavailable: shopper@example.test'), {
    code: 'EENVELOPE',
    responseCode: 550,
    command: 'RCPT TO',
    response: '550 <shopper@example.test> unknown',
  });
  const summary = errorSummary(smtp);
  assert.deepEqual(summary, { name: 'Error', code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
  assert.equal(JSON.stringify(summary).includes('@'), false);
  assert.deepEqual(errorSummary('boom'), { name: 'string' });
  assert.deepEqual(errorSummary(null), { name: 'null' });
});

test('cookieToken: a blank or whitespace session cookie is no token', () => {
  for (const raw of ['', ' ', '\t', decodeURIComponent('%09'), '\n\t ', undefined, null, 'a b']) {
    assert.equal(cookieToken(raw), undefined, JSON.stringify(raw));
  }
  assert.equal(cookieToken(' eyJ.a.b '), 'eyJ.a.b');
});
