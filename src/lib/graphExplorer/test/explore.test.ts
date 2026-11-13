/**
 * `explore.ts`: the Explore state read from a query string and written back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { exploreHref, exploreQuery, readExplore, sameView, type ExploreState } from '../explore.ts';

const read = (query: string) => readExplore(new URLSearchParams(query));

test('nothing set is the start screen with no dataset filter', () => {
    assert.deepEqual(read(''), { view: { kind: 'start' }, show: { kind: 'none' } });
    assert.deepEqual(read('?list=&show='), { view: { kind: 'start' }, show: { kind: 'none' } });
});

test('each view parameter reads as its view', () => {
    assert.deepEqual(read('list=all').view, { kind: 'list', scope: { kind: 'instance' } });
    assert.deepEqual(read('list=FinancialFlow').view, {
        kind: 'list',
        scope: { kind: 'class', id: 'FinancialFlow' },
    });
    assert.deepEqual(read('node=crsPurpose').view, { kind: 'node', id: 'crsPurpose' });
    assert.deepEqual(read('dataset=provenance%2FOECDDAC1').view, {
        kind: 'dataset',
        id: 'provenance/OECDDAC1',
    });
});

test('node wins over dataset, and dataset over list', () => {
    assert.deepEqual(read('list=all&dataset=d&node=n').view, { kind: 'node', id: 'n' });
    assert.deepEqual(read('list=all&dataset=d').view, { kind: 'dataset', id: 'd' });
});

test('show reads as one dataset or every dataset', () => {
    assert.deepEqual(read('show=all').show, { kind: 'all' });
    assert.deepEqual(read('show=provenance/OECDDAC1').show, {
        kind: 'dataset',
        id: 'provenance/OECDDAC1',
    });
});

test('every state writes a query that reads back as the same state', () => {
    const states: ExploreState[] = [
        { view: { kind: 'start' }, show: { kind: 'none' } },
        { view: { kind: 'start' }, show: { kind: 'all' } },
        { view: { kind: 'list', scope: { kind: 'instance' } }, show: { kind: 'none' } },
        {
            view: { kind: 'list', scope: { kind: 'class', id: 'FinancialFlow' } },
            show: { kind: 'dataset', id: 'provenance/OECDDAC1' },
        },
        { view: { kind: 'node', id: 'dc/base/odd id&x=1' }, show: { kind: 'none' } },
        { view: { kind: 'dataset', id: 'provenance/OECDDAC2A' }, show: { kind: 'all' } },
    ];
    for (const state of states) {
        assert.deepEqual(readExplore(new URLSearchParams(exploreQuery(state))), state);
    }
});

test('the start screen with no filter has a bare path', () => {
    assert.equal(
        exploreHref({ view: { kind: 'start' }, show: { kind: 'none' } }),
        '/graph-explorer',
    );
    assert.equal(
        exploreHref({ view: { kind: 'list', scope: { kind: 'instance' } }, show: { kind: 'all' } }),
        '/graph-explorer?list=all&show=all',
    );
});

test('two views are the same when they show the same thing', () => {
    assert.equal(sameView({ kind: 'node', id: 'a' }, { kind: 'node', id: 'a' }), true);
    assert.equal(sameView({ kind: 'node', id: 'a' }, { kind: 'dataset', id: 'a' }), false);
    assert.equal(
        sameView(
            { kind: 'list', scope: { kind: 'instance' } },
            { kind: 'list', scope: { kind: 'class', id: 'FinancialFlow' } },
        ),
        false,
    );
});
