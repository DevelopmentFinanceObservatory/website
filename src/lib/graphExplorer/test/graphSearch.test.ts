/**
 * `graphSearch.ts`: when the box asks the graph, which graph hits it adds
 * under the model's, and the answer's wire shape.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { graphSearchUrl, newGraphHits } from '../graphSearch.ts';
import type { SearchHit } from '../search.ts';
import { readGraphSearch, WireShapeError, type GraphSearchHit } from '../wire.ts';

const OFF = { base: false, un: false } as const;

test('the graph is asked only for a trimmed query of 3 to 256 characters, under the switches', () => {
    assert.equal(graphSearchUrl('  ab ', OFF), null);
    assert.equal(graphSearchUrl('x'.repeat(257), OFF), null);
    const url = new URL(graphSearchUrl('  Kenya ', { base: false, un: true }) ?? '', 'http://site');
    assert.equal(url.pathname, '/api/graph/schema/search');
    assert.deepEqual(Object.fromEntries(url.searchParams), { q: 'Kenya', base: '0', un: '1' });
});

test('a graph hit the model already lists is left out, and the rest keep the graph order', () => {
    const graph: GraphSearchHit[] = ['country/KEN', 'CurrencyKES', 'Count_Person'].map((ref) => ({
        ref,
        label: null,
        types: [],
        declared_by: null,
        via: 'name',
    }));
    const local = [{ id: 'CurrencyKES' } as SearchHit];
    assert.deepEqual(
        newGraphHits(graph, local).map((hit) => hit.ref),
        ['country/KEN', 'Count_Person'],
    );
});

test('the answer is read, and a hit found any other way is refused', () => {
    const body = {
        query: 'Kenya',
        hits: [
            {
                ref: 'country/KEN',
                label: 'Kenya',
                types: ['Country'],
                declared_by: 'base',
                via: 'name',
            },
        ],
        unavailable: ['un_system'],
    };
    assert.deepEqual(readGraphSearch(body), body);
    assert.throws(
        () => readGraphSearch({ ...body, hits: [{ ...body.hits[0], via: 'guess' }] }),
        WireShapeError,
    );
    assert.throws(() => readGraphSearch({ ...body, unavailable: ['mixer'] }), WireShapeError);
});
