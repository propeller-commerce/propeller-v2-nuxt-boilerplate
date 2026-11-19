import test from 'node:test';
import assert from 'node:assert/strict';
import { localPath } from '../../app/lib/localPath.ts';

test('keeps paths on this site, query and hash included', () => {
  for (const path of ['/', '/cart', '/en/account?tab=orders#top', '/search?q=a//b']) {
    assert.equal(localPath(path), path);
  }
  assert.equal(localPath('  /cart '), '/cart');
});

test('refuses anything that leaves the site or is not a string', () => {
  for (const raw of [
    'https://evil.test/',
    '//evil.test',
    '/\\evil.test',
    '\\\\evil.test',
    'javascript:alert(1)',
    'cart',
    '/\t/evil.test',
    '/\n/evil.test',
    '\t//evil.test',
    '/a\u0000b',
    '',
    undefined,
    null,
    ['/cart'],
  ]) {
    assert.equal(localPath(raw), undefined, JSON.stringify(raw));
  }
});
