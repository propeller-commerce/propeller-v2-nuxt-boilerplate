import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_NAMES, EVENT_NAME_SET, isKnownEvent, PAGE_TYPES } from './taxonomy.ts';

/**
 * Run with:  npm run test:tracking
 *
 * The taxonomy is the contract between three storefronts and one database. It
 * is also a hand-copied list of 47 strings, which is exactly the kind of thing
 * that acquires a duplicate or a typo silently — the ingest route drops unknown
 * names, so a typo here is not an error anywhere, just an event that never
 * arrives.
 */

test('no event name is declared twice', () => {
  // A duplicate collapses two events into one in every report, and the grouped
  // arrays make it easy to paste a name into the wrong group and not notice.
  assert.equal(EVENT_NAMES.length, new Set(EVENT_NAMES).size);
});

test('the lookup set matches the declared list', () => {
  // `isKnownEvent` is what the ingest route filters on; if the set and the list
  // disagree, events are dropped server-side with no error anywhere.
  assert.equal(EVENT_NAME_SET.size, EVENT_NAMES.length);
  for (const name of EVENT_NAMES) assert.ok(isKnownEvent(name), `${name} not accepted by isKnownEvent`);
});

test('an unknown name is rejected rather than stored', () => {
  assert.equal(isKnownEvent('definitely_not_an_event'), false);
  assert.equal(isKnownEvent(''), false);
});

test('GA4-canonical names are spelled exactly as Google defines them', () => {
  // These ten are not ours to rename — GA4 keys its built-in ecommerce reports
  // on the exact strings. A typo yields a custom event that populates nothing.
  for (const name of [
    'view_item_list', 'view_item', 'select_item', 'add_to_cart', 'remove_from_cart',
    'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase',
  ]) {
    assert.ok(isKnownEvent(name), `${name} missing from the taxonomy`);
  }
});

test('every propeller-namespaced name uses the dotted prefix', () => {
  // `ga4.ts` rewrites `propeller.` to `propeller_` because dots are illegal in
  // GA4 event names. A name that skipped the prefix would collide with Google's
  // own namespace instead.
  for (const name of EVENT_NAMES) {
    if (name.includes('.')) assert.ok(name.startsWith('propeller.'), `${name} has an unexpected prefix`);
  }
});

test('page types are unique and lower_snake_case', () => {
  assert.equal(PAGE_TYPES.length, new Set(PAGE_TYPES).size);
  for (const type of PAGE_TYPES) assert.match(type, /^[a-z][a-z_]*$/, `${type} is not lower_snake_case`);
});
