import assert from 'node:assert/strict';
import test from 'node:test';

import { searchApiBase } from '../searchApi.ts';

test('searchApiBase returns the configured origin', () => {
    assert.equal(
        searchApiBase({ SEARCH_API_BASE: 'https://apis.example.org' }),
        'https://apis.example.org',
    );
});

test('searchApiBase throws when SEARCH_API_BASE is unset or blank', () => {
    for (const env of [{}, { SEARCH_API_BASE: '' }, { SEARCH_API_BASE: '  ' }]) {
        assert.throws(
            () => searchApiBase(env),
            /missing required environment variable SEARCH_API_BASE/,
        );
    }
});
