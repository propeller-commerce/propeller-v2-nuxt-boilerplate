import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { parse } from 'graphql';
import {
  companyCreateVariables,
  CONTACT_FLAG,
  createdCompanyId,
  documentHash,
  mayRegisterContact,
  hourlyLimit,
  selectsField,
  registeredContact,
  REGISTRATION_DOCUMENT_HASHES,
  registrationStep,
  selectsContactRegister,
  signRegistration,
  verifyRegistration,
  type RegistrationContext,
} from '../../server/utils/registrationRouting.ts';
import { contactRegisterParentId, singleTopLevelField, verifyLastOrder } from '../../server/utils/orderEditorRouting.ts';

const SECRET = 'cookie-signing-test-secret';
const OPS = 'node_modules/@propeller-commerce/propeller-sdk-v2/dist/esm/generated/operations/';
const sdkDocument = async (name: string): Promise<string> =>
  (await import(pathToFileURL(`${process.cwd()}/${OPS}${name}.js`).href)).document;

const COMPANY_CREATE = await sdkDocument('companyCreate');
const ADDRESS_CREATE = await sdkDocument('companyAddressCreate');

const step = (query: string, variables: unknown, extra: Partial<RegistrationContext> = {}) => {
  const doc = parse(query, { noLocation: true });
  return registrationStep(singleTopLevelField(doc), doc, variables, { isAnonymous: true, registration: null, ...extra });
};

test('the allowlisted hashes match the installed SDK documents (update them after an SDK upgrade)', () => {
  const hash = (q: string) => documentHash(parse(q, { noLocation: true }));
  assert.equal(hash(COMPANY_CREATE), REGISTRATION_DOCUMENT_HASHES.companyCreate);
  assert.equal(hash(ADDRESS_CREATE), REGISTRATION_DOCUMENT_HASHES.companyAddressCreate);
  // Whitespace does not matter, content does.
  assert.equal(hash(`  ${COMPANY_CREATE.replace(/\n/g, '\n\n')}`), REGISTRATION_DOCUMENT_HASHES.companyCreate);
  assert.notEqual(hash(COMPANY_CREATE.replace('companyId\n', 'companyId\n  debtorId\n')), REGISTRATION_DOCUMENT_HASHES.companyCreate);
});

test('the vue-ui RegisterForm sends exactly these SDK documents through the proxy', async () => {
  const { readFileSync } = await import('node:fs');
  const ui = readFileSync('node_modules/@propeller-commerce/propeller-v2-vue-ui/dist/index.js', 'utf8');
  assert.match(ui, /companyService\.createCompany\(/);
  assert.match(ui, /addressService\.createCompanyAddress\(/);
});

test('companyCreate is elevated only for an anonymous caller sending the SDK document', () => {
  assert.deepEqual(step(COMPANY_CREATE, {}), { kind: 'company' });
  assert.equal(step(COMPANY_CREATE, {}, { isAnonymous: false }), null);
  // Any other selection, even of the same field, is not elevated.
  assert.equal(step('mutation m($input: CreateCompanyInput!) { companyCreate(input: $input) { companyId contacts { items { email } } } }', {}), null);
});

test('companyAddressCreate is elevated only for the company this browser just created, once per type', () => {
  const registration = { companyId: 77, used: '' };
  const vars = (companyId: unknown, type: unknown) => ({ input: { companyId, type, street: 'x' } });
  assert.deepEqual(step(ADDRESS_CREATE, vars(77, 'invoice'), { registration }), { kind: 'address', companyId: 77, flag: 'i' });
  assert.deepEqual(step(ADDRESS_CREATE, vars(77, 'delivery'), { registration }), { kind: 'address', companyId: 77, flag: 'd' });
  // The register response's session makes the caller non-anonymous; that is fine for addresses.
  assert.ok(step(ADDRESS_CREATE, vars(77, 'invoice'), { registration, isAnonymous: false }));
  assert.equal(step(ADDRESS_CREATE, vars(78, 'invoice'), { registration }), null);
  assert.equal(step(ADDRESS_CREATE, vars('77', 'invoice'), { registration }), null);
  assert.equal(step(ADDRESS_CREATE, vars(77, 'other'), { registration }), null);
  assert.equal(step(ADDRESS_CREATE, vars(77, 'invoice')), null);
  assert.equal(step(ADDRESS_CREATE, vars(77, 'invoice'), { registration: { companyId: 77, used: 'i' } }), null);
  assert.ok(step(ADDRESS_CREATE, vars(77, 'delivery'), { registration: { companyId: 77, used: 'i' } }));
});

test('other documents never elevate', () => {
  assert.equal(step('mutation { contactDelete(id: 1) }', {}), null);
  assert.equal(step('{ viewer { __typename } }', {}), null);
});

test('createdCompanyId reads the new id from a companyCreate response only', () => {
  assert.equal(createdCompanyId({ data: { companyCreate: { companyId: 77 } } }), 77);
  assert.equal(createdCompanyId({ data: { companyCreate: { companyId: '77' } } }), null);
  assert.equal(createdCompanyId({ data: { companyCreate: null } }), null);
  assert.equal(createdCompanyId(null), null);
});

test('the registration cookie round-trips, expires after 15 minutes and is not a last-order cookie', () => {
  const now = Date.now();
  const fresh = signRegistration(SECRET, 77, '', now);
  assert.deepEqual(verifyRegistration(SECRET, fresh, now), { companyId: 77, used: '' });
  assert.deepEqual(verifyRegistration(SECRET, signRegistration(SECRET, 77, 'i', now), now), { companyId: 77, used: 'i' });
  assert.equal(verifyRegistration(SECRET, fresh, now + 15 * 60_000), null);
  assert.equal(verifyRegistration('other', fresh, now), null);
  assert.equal(verifyRegistration(SECRET, undefined), null);
  assert.equal(verifyLastOrder(SECRET, fresh, now), null);
});

test('an elevated companyCreate keeps only the registration fields', () => {
  const vars = { input: { name: 'A', email: 'a@x.test', taxNumber: 'NL1', cocNumber: '1', phone: '0', debtorId: 'D1', parentId: 5 }, contactSearchArguments: { page: 1 } };
  assert.deepEqual(companyCreateVariables(vars), {
    input: { name: 'A', email: 'a@x.test', taxNumber: 'NL1', cocNumber: '1', phone: '0' },
    contactSearchArguments: { page: 1 },
  });
  assert.deepEqual(companyCreateVariables(null), { input: {} });
});

test('an anonymous contactRegister is allowed only into the company this browser just created, once', () => {
  const reg = (used = '') => ({ companyId: 77, used });
  assert.equal(mayRegisterContact(77, { isAnonymous: true, registration: reg() }), true);
  assert.equal(mayRegisterContact(77, { isAnonymous: true, registration: reg('id') }), true);
  // Another company, no cookie, no parentId, already registered, or a logged-in caller.
  assert.equal(mayRegisterContact(78, { isAnonymous: true, registration: reg() }), false);
  assert.equal(mayRegisterContact(77, { isAnonymous: true, registration: null }), false);
  assert.equal(mayRegisterContact(null, { isAnonymous: true, registration: reg() }), false);
  assert.equal(mayRegisterContact(77, { isAnonymous: true, registration: reg(CONTACT_FLAG) }), false);
  assert.equal(mayRegisterContact(77, { isAnonymous: false, registration: reg() }), false);
});

test('contactRegister is found anywhere in a document; parentId is read from a single field only', () => {
  assert.equal(selectsContactRegister(parse('mutation { a: contactRegister(input: { email: "x", parentId: 1 }) { __typename } }')), true);
  assert.equal(selectsContactRegister(parse('mutation { companyCreate(input: {}) { companyId } b: contactRegister(input: { email: "x", parentId: 2 }) { __typename } }')), true);
  assert.equal(selectsContactRegister(parse('mutation { companyCreate(input: {}) { companyId } }')), false);
  const one = parse('mutation r($i: RegisterContactInput!) { contactRegister(input: $i) { __typename } }');
  assert.equal(contactRegisterParentId(singleTopLevelField(one), { i: { parentId: 77 } }), 77);
  const two = parse('mutation { a: contactRegister(input: { email: "x", parentId: 77 }) { __typename } b: contactRegister(input: { email: "y", parentId: 78 }) { __typename } }');
  assert.equal(contactRegisterParentId(singleTopLevelField(two), {}), null);
});

test('the registration cookie carries the contact flag next to the address flags', () => {
  assert.deepEqual(verifyRegistration(SECRET, signRegistration(SECRET, 77, 'cid')), { companyId: 77, used: 'cid' });
});

test('a contact counts as registered when the response carries it, even with partial errors', () => {
  assert.equal(registeredContact({ data: { contactRegister: { contact: { contactId: 1 } } }, errors: [{ message: 'Unauthorized' }] }), true);
  assert.equal(registeredContact({ data: { contactRegister: null }, errors: [{ message: 'Email exists' }] }), false);
  assert.equal(registeredContact(null), false);
});

test('registration limits come from the environment: a whole number, 0 for none, else the default', () => {
  assert.deepEqual(hourlyLimit(undefined, 30), { limit: 30, windowMs: 3_600_000 });
  assert.equal(hourlyLimit(' 200 ', 30).limit, 200);
  assert.equal(hourlyLimit('0', 30).limit, Number.MAX_SAFE_INTEGER);
  for (const bad of ['-1', '1.5', 'many', '9999999']) assert.equal(hourlyLimit(bad, 30).limit, 30, bad);
});

test('companyCreate is found anywhere in a document', () => {
  assert.equal(selectsField(parse('mutation { a: companyCreate(input: { name: "x" }) { companyId } }'), 'companyCreate'), true);
  assert.equal(selectsField(parse('mutation { cartStart { cartId } b: companyCreate(input: {}) { companyId } }'), 'companyCreate'), true);
  assert.equal(selectsField(parse('mutation { companyAddressCreate(input: {}) { id } }'), 'companyCreate'), false);
});
