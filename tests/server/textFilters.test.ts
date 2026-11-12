import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTextFiltersParam } from '../../server/utils/textFilters.ts';

test('builds API text filters in the { name, values, exclude, type } shape', () => {
  // The old shape ({ attributeName, attributeValues }) made the API answer 400.
  assert.deepEqual(parseTextFiltersParam('{"Kleur":["Rood","Blauw"],"Merk":"Pilot"}'), [
    { name: 'Kleur', values: ['Rood', 'Blauw'], exclude: false, type: 'TEXT' },
    { name: 'Merk', values: ['Pilot'], exclude: false, type: 'TEXT' },
  ]);
});

test('no filters for a missing, malformed or empty param', () => {
  for (const raw of [undefined, '', 'not json', '[]', 'null', '{}', '{"Kleur":[]}']) {
    assert.equal(parseTextFiltersParam(raw), undefined, String(raw));
  }
});
