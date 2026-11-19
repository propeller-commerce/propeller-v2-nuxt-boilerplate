import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIpFrom } from '../../server/utils/clientIp.ts';

test('takes the hop our own proxy added, not the client-supplied left-most one', () => {
  assert.equal(clientIpFrom('6.6.6.6, 203.0.113.9', '127.0.0.1', 1), '203.0.113.9');
  assert.equal(clientIpFrom('6.6.6.6,203.0.113.9 , 10.0.0.2', '127.0.0.1', 2), '203.0.113.9');
  assert.equal(clientIpFrom('203.0.113.9', '127.0.0.1', 1), '203.0.113.9');
});

test('a spoofed X-Forwarded-For per request does not change the bucket', () => {
  const ips = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((spoof) => clientIpFrom(`${spoof}, 203.0.113.9`, undefined, 1));
  assert.deepEqual(new Set(ips), new Set(['203.0.113.9']));
});

test('fewer hops than trusted: the left-most; none: the socket, else unknown', () => {
  assert.equal(clientIpFrom('203.0.113.9', undefined, 3), '203.0.113.9');
  assert.equal(clientIpFrom(undefined, '198.51.100.4', 1), '198.51.100.4');
  assert.equal(clientIpFrom(' , ', undefined, 1), 'unknown');
  assert.equal(clientIpFrom('', undefined, 1), 'unknown');
});

test('a nonsense hop count falls back to 1', () => {
  assert.equal(clientIpFrom('6.6.6.6, 203.0.113.9', undefined, 0), '203.0.113.9');
  assert.equal(clientIpFrom('6.6.6.6, 203.0.113.9', undefined, Number.NaN), '203.0.113.9');
});
