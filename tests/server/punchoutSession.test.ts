import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'graphql';
import { singleTopLevelField } from '../../server/utils/orderEditorRouting.ts';
import {
  hookUrl,
  magicTokenExchange,
  openPunchout,
  PURPOSE,
  sealPunchout,
  type PunchoutSession,
} from '../../server/utils/punchoutSession.ts';

const SECRET = 'test-secret';
const session: PunchoutSession = {
  mode: 'oci',
  returnUrl: 'https://erp.example.test/oci-return',
  target: '_self',
  session: { CALLER: 'X' },
};

test('hookUrl: https only; PUNCHOUT_HOOK_HOSTS, when set, names the allowed hosts', () => {
  assert.equal(hookUrl('https://erp.example.test/r?x=1', '')?.origin, 'https://erp.example.test');
  assert.equal(hookUrl('https://erp.example.test/r', 'other.test, ERP.example.test')?.hostname, 'erp.example.test');
  for (const [raw, hosts] of [
    ['http://erp.example.test/r', ''],
    ['javascript:alert(1)', ''],
    ['data:text/html,x', ''],
    ['//erp.example.test/r', ''],
    ['https://user:pw@erp.example.test/r', ''],
    ['https://attacker.example/collect', 'erp.example.test'],
    ['https://erp.example.test.attacker.example/', 'erp.example.test'],
    ['', ''],
    [undefined, ''],
  ] as const) {
    assert.equal(hookUrl(raw, hosts), null, `${raw} / ${hosts}`);
  }
});

test('a sealed session opens only for its purpose, its binding and before it expires', () => {
  const now = 1_700_000_000_000;
  const pending = sealPunchout(SECRET, PURPOSE.pending, session, 'mtoken-1', 600, now);
  assert.deepEqual(openPunchout(SECRET, PURPOSE.pending, pending, 'mtoken-1', now), session);
  assert.equal(openPunchout(SECRET, PURPOSE.pending, pending, 'mtoken-2', now), null, 'another token');
  assert.equal(openPunchout(SECRET, PURPOSE.active, pending, 'mtoken-1', now), null, 'another purpose');
  assert.equal(openPunchout(SECRET, PURPOSE.pending, pending, undefined, now), null, 'no binding');
  assert.equal(openPunchout('other', PURPOSE.pending, pending, 'mtoken-1', now), null, 'another secret');
  assert.equal(openPunchout(SECRET, PURPOSE.pending, pending, 'mtoken-1', now + 600_000), null, 'expired');
  assert.equal(pending.includes('mtoken-1'), false, 'the token itself is not stored');
  // The plain JSON cookie of the old implementation never verifies.
  assert.equal(openPunchout(SECRET, PURPOSE.active, JSON.stringify(session), 'x', now), null);
});

const exchange = (query: string, variables: unknown, response: unknown) =>
  magicTokenExchange(singleTopLevelField(parse(query)), variables, response);

test('magicTokenExchange: the exchanged token and the new access token, from variables or inline', () => {
  const doc = 'mutation m($id: String!) { magicTokenLogin(id: $id) { session { accessToken } } }';
  const ok = { data: { magicTokenLogin: { session: { accessToken: 'jwt-1' } } } };
  assert.deepEqual(exchange(doc, { id: 'tok' }, ok), { token: 'tok', accessToken: 'jwt-1' });
  assert.deepEqual(exchange('mutation { magicTokenLogin(id: "tok") { session { accessToken } } }', {}, ok), {
    token: 'tok',
    accessToken: 'jwt-1',
  });
  assert.deepEqual(exchange(doc, { id: 'tok' }, { errors: [{ message: 'used' }], data: { magicTokenLogin: null } }), {
    token: 'tok',
    accessToken: null,
  });
  assert.deepEqual(
    exchange('mutation m($id: String!) { a: magicTokenLogin(id: $id) { session { accessToken } } }', { id: 't' }, {
      data: { a: { session: { accessToken: 'jwt-2' } } },
    }),
    { token: 't', accessToken: 'jwt-2' },
  );
  assert.equal(exchange('query { viewer { __typename } }', {}, ok), null);
  assert.equal(exchange(doc, {}, ok), null, 'no token');
});
