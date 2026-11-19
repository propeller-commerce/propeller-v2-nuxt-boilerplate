import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewerLookup, parseViewer, viewerIdentity, type Viewer } from '../../server/utils/viewer.ts';

const contact: Viewer = { type: 'Contact', userId: 73, companyIds: [37], managerOf: [37] };

test('parseViewer: contacts with their companies and manager roles, customers, and nothing else', () => {
  assert.deepEqual(
    parseViewer({
      __typename: 'Contact',
      contactId: 73,
      company: { companyId: 37 },
      purchaseAuthorizationConfigs: {
        items: [
          { purchaseRole: 'AUTHORIZATION_MANAGER', company: { companyId: 37 } },
          { purchaseRole: 'PURCHASER', company: { companyId: 39 } },
          { purchaseRole: 'AUTHORIZATION_MANAGER', company: { companyId: 36 } },
          { purchaseRole: 'AUTHORIZATION_MANAGER', company: null },
        ],
      },
    }),
    { type: 'Contact', userId: 73, companyIds: [37, 39, 36], managerOf: [37, 36] },
  );
  // Every company the contact belongs to counts, roles or not.
  assert.deepEqual(
    parseViewer({ __typename: 'Contact', contactId: 73, company: { companyId: 37 }, companies: { items: [{ companyId: 41 }, null, { companyId: 37 }] } }),
    { type: 'Contact', userId: 73, companyIds: [37, 41], managerOf: [] },
  );
  assert.deepEqual(parseViewer({ __typename: 'Customer', customerId: 5 }), { type: 'Customer', userId: 5, companyIds: [], managerOf: [] });
  // The upstream's answer for a guest, and anything malformed.
  assert.equal(parseViewer({ __typename: 'User' }), null);
  assert.equal(parseViewer({ __typename: 'Contact' }), null);
  assert.equal(parseViewer({ contactId: 73 }), null);
  assert.equal(parseViewer(null), null);
});

test('no token: a guest, without a lookup', async () => {
  let calls = 0;
  const lookup = createViewerLookup(async () => (calls++, contact));
  assert.equal(await lookup(undefined), null);
  assert.equal(await lookup(''), null);
  assert.equal(calls, 0);
});

test('cached per token until the ttl passes, a definite guest answer included', async () => {
  let now = 0;
  let calls = 0;
  const lookup = createViewerLookup(async (t) => (calls++, t === 'guest' ? null : contact), { ttlMs: 1000, now: () => now });
  assert.deepEqual(await lookup('t'), contact);
  await lookup('t');
  await lookup('guest');
  await lookup('guest');
  assert.equal(calls, 2);
  now = 1001;
  await lookup('t');
  assert.equal(calls, 3);
});

test('a failed lookup is anonymous and not cached (fail closed)', async () => {
  let fail = true;
  let calls = 0;
  const lookup = createViewerLookup(async () => {
    calls++;
    if (fail) throw new Error('upstream down');
    return contact;
  });
  assert.equal(await lookup('t'), null);
  fail = false;
  assert.deepEqual(await lookup('t'), contact);
  assert.equal(calls, 2);
});

test('parallel requests for one token share a single lookup', async () => {
  let calls = 0;
  let release: () => void = () => {};
  const lookup = createViewerLookup(() => {
    calls++;
    return new Promise((resolve) => {
      release = () => resolve(contact);
    });
  });
  const pending = Array.from({ length: 8 }, () => lookup('t'));
  release();
  assert.deepEqual(await Promise.all(pending), Array(8).fill(contact));
  assert.equal(calls, 1);
});

test('the cache stays bounded and never stores a raw token', async () => {
  const seen: string[] = [];
  const lookup = createViewerLookup(async (t) => (seen.push(t), contact), { maxEntries: 2 });
  await lookup('a');
  await lookup('b');
  await lookup('c');
  assert.equal(lookup.size(), 2);
  await lookup('a'); // evicted, looked up again
  assert.deepEqual(seen, ['a', 'b', 'c', 'a']);
});

test('viewerIdentity: analytics identity from the verified viewer, never the claim', () => {
  const multi: Viewer = { type: 'Contact', userId: 73, companyIds: [37, 38], managerOf: [] };
  assert.deepEqual(viewerIdentity(multi, 38), { userMode: 'b2b', contactId: 73, customerId: null, companyId: 38 });
  assert.deepEqual(viewerIdentity(multi, 999), { userMode: 'b2b', contactId: 73, customerId: null, companyId: 37 });
  assert.deepEqual(viewerIdentity(multi, undefined).companyId, 37);
  assert.deepEqual(viewerIdentity({ type: 'Customer', userId: 5, companyIds: [], managerOf: [] }, 37), {
    userMode: 'b2c', contactId: null, customerId: 5, companyId: null,
  });
  assert.deepEqual(viewerIdentity(null, 37), { userMode: 'anonymous', contactId: null, customerId: null, companyId: null });
});
