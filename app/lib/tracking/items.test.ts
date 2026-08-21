import test from 'node:test';
import assert from 'node:assert/strict';
import { diffCartLines } from './items.ts';

/**
 * Run with:  npm run test:tracking
 *
 * `diffCartLines` is the only real algorithm in the tracking port, and the only
 * path to `remove_from_cart`: the UI package exposes ONE `afterCartUpdate(cart)`
 * callback for add, remove and quantity edit alike, so provenance has to come
 * from comparing snapshots. Every bug here produces plausible-but-wrong GA4
 * revenue rather than a crash.
 */

const line = (itemId: string, quantity: number) => ({ itemId, quantity, sum: 10 }) as never;

test('a quantity increase reports the DELTA, not the new line total', () => {
  // 2 -> 5 is an add of THREE. Sending 5 multiplies cart-add volume, which is
  // the exact mistake the WordPress plugin avoids with its prev_quantity check.
  const out = diffCartLines([line('a', 2)], [line('a', 5)]);
  assert.deepEqual(out.map((d) => [d.direction, d.delta]), [['added', 3]]);
});

test('a quantity decrease is a removal of the difference', () => {
  const out = diffCartLines([line('a', 5)], [line('a', 2)]);
  assert.deepEqual(out.map((d) => [d.direction, d.delta]), [['removed', 3]]);
});

test('a line that disappears is removed in full', () => {
  const out = diffCartLines([line('a', 4)], []);
  assert.deepEqual(out.map((d) => [d.direction, d.delta]), [['removed', 4]]);
});

test('a new line is an add of its whole quantity', () => {
  const out = diffCartLines([], [line('b', 2)]);
  assert.deepEqual(out.map((d) => [d.direction, d.delta]), [['added', 2]]);
});

test('an unchanged line emits nothing — re-renders must not invent events', () => {
  assert.deepEqual(diffCartLines([line('a', 3)], [line('a', 3)]), []);
});

test('adds and removals in one update are reported separately', () => {
  const out = diffCartLines([line('a', 2), line('b', 1)], [line('a', 1), line('c', 5)]);
  assert.deepEqual(
    out.map((d) => [d.line.itemId, d.direction, d.delta]).sort(),
    [['a', 'removed', 1], ['b', 'removed', 1], ['c', 'added', 5]].sort()
  );
});
