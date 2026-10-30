import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, PRICE_REQUEST_RATE_LIMIT } from '../../server/utils/rateLimit.ts';

const clock = (start = 0) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
};

test('price-request rule is 10 requests per 10 minutes', () => {
  assert.deepEqual(PRICE_REQUEST_RATE_LIMIT, { limit: 10, windowMs: 10 * 60 * 1000 });
});

test('allows up to the limit, then answers with a Retry-After in seconds', () => {
  const c = clock();
  const limiter = createRateLimiter(c.now);
  for (let i = 0; i < 10; i++) {
    assert.equal(limiter.hit('/api/price-request:1.2.3.4', PRICE_REQUEST_RATE_LIMIT).allowed, true);
  }
  c.advance(60_000);
  const over = limiter.hit('/api/price-request:1.2.3.4', PRICE_REQUEST_RATE_LIMIT);
  assert.deepEqual(over, { allowed: false, retryAfter: 540 });
});

test('the window expires and the counter starts again', () => {
  const c = clock(1_000);
  const limiter = createRateLimiter(c.now);
  const rule = { limit: 2, windowMs: 1_000 };
  limiter.hit('k', rule);
  limiter.hit('k', rule);
  assert.equal(limiter.hit('k', rule).allowed, false);
  c.advance(1_000);
  assert.equal(limiter.hit('k', rule).allowed, true);
});

test('retryAfter is at least one second', () => {
  const c = clock();
  const limiter = createRateLimiter(c.now);
  const rule = { limit: 1, windowMs: 1_000 };
  limiter.hit('k', rule);
  c.advance(999);
  assert.deepEqual(limiter.hit('k', rule), { allowed: false, retryAfter: 1 });
});

test('separate IPs and routes count independently', () => {
  const limiter = createRateLimiter(() => 0);
  const rule = { limit: 1, windowMs: 60_000 };
  assert.equal(limiter.hit('/api/price-request:1.1.1.1', rule).allowed, true);
  assert.equal(limiter.hit('/api/price-request:1.1.1.1', rule).allowed, false);
  assert.equal(limiter.hit('/api/price-request:2.2.2.2', rule).allowed, true);
  assert.equal(limiter.hit('/api/other:1.1.1.1', rule).allowed, true);
});

test('expired entries are evicted', () => {
  const c = clock();
  const limiter = createRateLimiter(c.now);
  const rule = { limit: 5, windowMs: 1_000 };
  limiter.hit('a', rule);
  limiter.hit('b', rule);
  assert.equal(limiter.size(), 2);
  c.advance(1_000);
  limiter.hit('c', rule);
  assert.equal(limiter.size(), 1);
});
