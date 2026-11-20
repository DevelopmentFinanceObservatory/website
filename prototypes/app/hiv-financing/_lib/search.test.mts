import assert from 'node:assert/strict';
import test from 'node:test';

import { COUNTRIES } from './fixture.mts';
import { matchCountries } from './search.ts';

test('search ignores accents and case and ranks prefix, word, then substring matches', () => {
    const names = (query: string) => matchCountries(COUNTRIES, query).map(({ name }) => name);

    assert.deepEqual(names('cote'), ["Côte d'Ivoire"]);
    assert.deepEqual(names('IVOIRE'), ["Côte d'Ivoire"]);
    assert.deepEqual(names('congo'), ['DR Congo', 'Republic of the Congo']);
    assert.deepEqual(names('ong'), ['DR Congo', 'Republic of the Congo']);
    assert.equal(names('').length, COUNTRIES.length);
    assert.deepEqual(names('zz'), []);
});
