import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { checkTrackerAccess, isTrackerPath, TRACKER_AUTH_CHALLENGE } from '../../server/utils/trackerAccess.ts';

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

test('unset or empty secret fails closed with 404', () => {
  assert.deepEqual(checkTrackerAccess(undefined, basic('a', 'x')), { allowed: false, status: 404 });
  assert.deepEqual(checkTrackerAccess('', basic('a', '')), { allowed: false, status: 404 });
  assert.deepEqual(checkTrackerAccess('   ', basic('a', '   ')), { allowed: false, status: 404 });
});

test('missing or wrong credentials answer 401', () => {
  assert.deepEqual(checkTrackerAccess('s3cret', undefined), { allowed: false, status: 401 });
  assert.deepEqual(checkTrackerAccess('s3cret', basic('admin', 'wrong')), { allowed: false, status: 401 });
  assert.deepEqual(checkTrackerAccess('s3cret', basic('admin', 's3cret!')), { allowed: false, status: 401 });
});

test('right password with any username is allowed', () => {
  assert.deepEqual(checkTrackerAccess('s3cret', basic('admin', 's3cret')), { allowed: true });
  assert.deepEqual(checkTrackerAccess('s3cret', basic('', 's3cret')), { allowed: true });
  assert.deepEqual(checkTrackerAccess('s3cret', 'basic ' + Buffer.from('x:s3cret').toString('base64')), { allowed: true });
});

test('a password containing a colon is kept whole', () => {
  assert.deepEqual(checkTrackerAccess('a:b', basic('u', 'a:b')), { allowed: true });
});

test('malformed headers answer 401', () => {
  const secret = 's3cret';
  for (const header of [
    'Bearer s3cret',
    'Basic',
    'Basic ',
    'Basic !!!not-base64!!!',
    `Basic ${Buffer.from('no-colon-s3cret').toString('base64')}`,
    's3cret',
    `Digest ${Buffer.from('a:s3cret').toString('base64')}`,
  ]) {
    assert.deepEqual(checkTrackerAccess(secret, header), { allowed: false, status: 401 }, header);
  }
});

test('challenge header names the tracker realm', () => {
  assert.equal(TRACKER_AUTH_CHALLENGE, 'Basic realm="tracker", charset="UTF-8"');
});

test('tracker paths are matched including locale prefixes and sub-paths', () => {
  for (const p of [
    '/tracker',
    '/tracker/',
    '/tracker?section=search',
    '/tracker/_payload.json',
    '/en/tracker',
    '/nl/tracker/anything',
    '/nl-be/tracker',
    '/TRACKER',
    '//tracker',
    '/%74racker',
    '/api/tracker',
    '/api/tracker?metric=health',
    '/api/tracker/rollup',
    '/api/tracker-rollup',
  ]) {
    assert.equal(isTrackerPath(p), true, p);
  }
});

test('unrelated paths are not matched', () => {
  for (const p of ['/', '/track', '/api/track', '/trackers', '/product/1/tracker', '/en/product', '/api/graphql', '/abc/tracker']) {
    assert.equal(isTrackerPath(p), false, p);
  }
});
