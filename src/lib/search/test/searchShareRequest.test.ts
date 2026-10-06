import assert from 'node:assert/strict';
import test from 'node:test';

import { readSearchShareRequest, SEARCH_SHARE_MAX_PARTS } from '../searchShareRequest.ts';

const part = (partIndex: number) => ({
    partIndex,
    variableText: null,
    specId: `spec_${partIndex}a`,
    identity: {},
    operations: [],
    definition: {},
});

const body = (partCount: number, mode: string = 'live') => ({
    mode,
    query: ' gdp ',
    parts: Array.from({ length: partCount }, (_, index) => part(index)),
});

for (const mode of ['live', 'snapshot']) {
    test(`a ${mode} share of ${SEARCH_SHARE_MAX_PARTS} parts reads, with the query trimmed`, () => {
        const request = readSearchShareRequest(body(SEARCH_SHARE_MAX_PARTS, mode));

        assert.equal(request?.mode, mode);
        assert.equal(request?.query, 'gdp');
        assert.equal(request?.parts.length, SEARCH_SHARE_MAX_PARTS);
    });

    test(`a ${mode} share over the cap is refused`, () => {
        assert.equal(readSearchShareRequest(body(SEARCH_SHARE_MAX_PARTS + 1, mode)), null);
    });
}

test('an unknown mode, an empty query or no parts is refused', () => {
    assert.equal(readSearchShareRequest(body(1, 'draft')), null);
    assert.equal(readSearchShareRequest({ ...body(1), query: '  ' }), null);
    assert.equal(readSearchShareRequest(body(0)), null);
});
