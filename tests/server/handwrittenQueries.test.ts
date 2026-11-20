import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSchema, parse, validate } from 'graphql';
import { ORDER_OWNER_QUERY } from '../../server/utils/orderEditorRouting.ts';
import { PAYMENT_ORDER_QUERY } from '../../server/utils/payment.ts';
import { VIEWER_QUERY } from '../../server/utils/viewer.ts';

// Refresh with scripts/update-propeller-schema.mjs when the API schema changes.
const schema = buildSchema(readFileSync(new URL('../fixtures/propeller-schema.graphql', import.meta.url), 'utf8'));
const errors = (query: string) => validate(schema, parse(query)).map((e) => e.message);

test('hand-written queries are valid against the Propeller schema', () => {
  for (const [name, query] of Object.entries({ VIEWER_QUERY, PAYMENT_ORDER_QUERY, ORDER_OWNER_QUERY })) {
    assert.deepEqual(errors(query), [], name);
  }
});

test('the schema check catches a field the API does not have', () => {
  assert.notDeepEqual(errors('query q($orderId: Int) { order(orderId: $orderId) { orderId } }'), []);
});
