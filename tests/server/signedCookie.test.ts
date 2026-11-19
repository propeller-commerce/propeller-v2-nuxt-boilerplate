import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  DERIVED_SECRET_LABEL,
  resolveCookieSecret,
  signCookieValue,
  verifyCookieValue,
} from '../../server/utils/signedCookie.ts';

const SECRET = 'test-secret';

test('round-trips any payload for its purpose until it expires', () => {
  const now = 1_700_000_000_000;
  for (const payload of ['123:', '{"returnUrl":"https://x.test/a?b=c"}', '', 'ünïcode . dots']) {
    const value = signCookieValue(SECRET, 'punchout', payload, 60, now);
    assert.match(value, /^[A-Za-z0-9_-]*\.\d+\.[A-Za-z0-9_-]{43}$/);
    assert.equal(verifyCookieValue(SECRET, 'punchout', value, now), payload);
    assert.equal(verifyCookieValue(SECRET, 'punchout', value, now + 59_000), payload);
    assert.equal(verifyCookieValue(SECRET, 'punchout', value, now + 60_000), null, 'expired');
  }
});

test('a value for one purpose never verifies as another', () => {
  const value = signCookieValue(SECRET, 'last-order', '9:', 60);
  assert.equal(verifyCookieValue(SECRET, 'registration', value), null);
  assert.equal(verifyCookieValue(SECRET, 'last-order', value), '9:');
});

test('tampering with payload, expiry or mac, a wrong secret or garbage is refused', () => {
  const value = signCookieValue(SECRET, 'p', '9:', 60);
  const [body, exp, mac] = value.split('.');
  const other = Buffer.from('8:').toString('base64url');
  assert.equal(verifyCookieValue(SECRET, 'p', `${other}.${exp}.${mac}`), null);
  assert.equal(verifyCookieValue(SECRET, 'p', `${body}.${Number(exp) + 1000}.${mac}`), null);
  assert.equal(verifyCookieValue(SECRET, 'p', `${body}.${exp}.${'A'.repeat(43)}`), null);
  assert.equal(verifyCookieValue('other', 'p', value), null);
  for (const junk of [undefined, null, '', '9', '9.abc', `${value}x`, `${value}.x`]) {
    assert.equal(verifyCookieValue(SECRET, 'p', junk), null, String(junk));
  }
});

test('no secret: nothing is signed and nothing verifies', () => {
  assert.equal(signCookieValue('', 'p', '9:', 60), '');
  assert.equal(verifyCookieValue('', 'p', signCookieValue(SECRET, 'p', '9:', 60)), null);
});

test('the secret: COOKIE_SIGNING_SECRET, else derived from the order-editor key (never the key itself)', () => {
  assert.deepEqual(resolveCookieSecret('dedicated', 'editor-key'), { secret: 'dedicated', derived: false });
  const derived = resolveCookieSecret('', 'editor-key');
  assert.equal(derived.derived, true);
  assert.equal(derived.secret, createHmac('sha256', 'editor-key').update(DERIVED_SECRET_LABEL).digest('hex'));
  assert.notEqual(derived.secret, 'editor-key');
  assert.deepEqual(resolveCookieSecret('', ''), { secret: '', derived: false });
});
