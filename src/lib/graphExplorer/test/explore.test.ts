/**
 * `explore.ts`: the Explore state read from a query string and written back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    awaitsTerms,
    carriedHref,
    checkFilter,
    exploreHref,
    exploreQuery,
    listScopeExists,
    NO_CARRIED,
    readCarried,
    readExplore,
    moveHref,
    sameView,
    switchBase,
    type ExploreState,
} from '../explore.ts';
import { buildModel, type ListScope } from '../model.ts';
import { readSchema, readUsage } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';

const read = (query: string) => readExplore(new URLSearchParams(query));

test('nothing set is the start screen with no dataset filter', () => {
    const start = { view: { kind: 'start' }, show: { kind: 'none' }, base: false };
    assert.deepEqual(read(''), start);
    assert.deepEqual(read('?list=&show=&base='), start);
});

test('each view parameter reads as its view', () => {
    assert.deepEqual(read('list=dfo').view, { kind: 'list', scope: { kind: 'dfo' } });
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
    assert.deepEqual(read('list=dfo&dataset=d&node=n').view, { kind: 'node', id: 'n' });
    assert.deepEqual(read('list=dfo&dataset=d').view, { kind: 'dataset', id: 'd' });
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
        { view: { kind: 'start' }, show: { kind: 'none' }, base: false },
        { view: { kind: 'start' }, show: { kind: 'all' }, base: false },
        {
            view: { kind: 'list', scope: { kind: 'dfo' } },
            show: { kind: 'none' },
            base: false,
        },
        {
            view: { kind: 'list', scope: { kind: 'class', id: 'FinancialFlow' } },
            show: { kind: 'dataset', id: 'provenance/OECDDAC1' },
            base: true,
        },
        { view: { kind: 'node', id: 'dc/base/odd id&x=1' }, show: { kind: 'none' }, base: true },
        { view: { kind: 'node', id: 'dc/base/odd id&x=1' }, show: { kind: 'none' }, base: false },
        {
            view: { kind: 'dataset', id: 'provenance/OECDDAC2A' },
            show: { kind: 'all' },
            base: false,
        },
    ];
    for (const state of states) {
        assert.deepEqual(readExplore(new URLSearchParams(exploreQuery(state))), state);
    }
});

test('the start screen with no filter has a bare path', () => {
    assert.equal(
        exploreHref({ view: { kind: 'start' }, show: { kind: 'none' }, base: false }),
        '/graph-explorer',
    );
    assert.equal(
        exploreHref({
            view: { kind: 'list', scope: { kind: 'dfo' } },
            show: { kind: 'all' },
            base: false,
        }),
        '/graph-explorer?list=dfo&show=all',
    );
});

test('base reads as on only for 1', () => {
    assert.equal(read('base=1').base, true);
    for (const query of ['', 'base=', 'base=0', 'base=true']) {
        assert.equal(read(query).base, false, query);
    }
});

test('every carried parameter rides on a sheet screen link and reads back', () => {
    const carried = { show: { kind: 'dataset', id: 'provenance/OECDDAC1' }, base: true } as const;
    const href = carriedHref('/graph-explorer/new-sheet', carried);
    assert.equal(href, '/graph-explorer/new-sheet?show=provenance%2FOECDDAC1&base=1');
    assert.deepEqual(readCarried(new URL(href, 'https://x.invalid').searchParams), carried);
    assert.equal(
        carriedHref('/graph-explorer/check-sheet', NO_CARRIED),
        '/graph-explorer/check-sheet',
    );
});

test('two views are the same when they show the same thing', () => {
    assert.equal(sameView({ kind: 'node', id: 'a' }, { kind: 'node', id: 'a' }), true);
    assert.equal(sameView({ kind: 'node', id: 'a' }, { kind: 'dataset', id: 'a' }), false);
    assert.equal(
        sameView(
            { kind: 'list', scope: { kind: 'dfo' } },
            { kind: 'list', scope: { kind: 'class', id: 'FinancialFlow' } },
        ),
        false,
    );
});

test('a move to the view on show adds no history entry; any other keeps the carried parameters', () => {
    const state: ExploreState = {
        view: { kind: 'node', id: 'crsPurpose' },
        show: { kind: 'dataset', id: 'provenance/OECDDAC1' },
        base: true,
    };
    assert.equal(moveHref(state, { kind: 'node', id: 'crsPurpose' }), null);
    assert.equal(
        moveHref(state, { kind: 'start' }),
        '/graph-explorer?show=provenance%2FOECDDAC1&base=1',
    );
});

test('a filter naming a dataset the model lacks applies no filter and names the dataset', () => {
    const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
    const known = { kind: 'dataset', id: 'provenance/OECDDAC1' } as const;
    assert.deepEqual(checkFilter(model, known), { show: known, unknown: null });
    assert.deepEqual(checkFilter(model, { kind: 'dataset', id: 'provenance/Gone' }), {
        show: { kind: 'none' },
        unknown: 'provenance/Gone',
    });
    assert.deepEqual(checkFilter(model, { kind: 'all' }), {
        show: { kind: 'all' },
        unknown: null,
    });
});

test('a list scope exists for every DFO property, a class or a value list', () => {
    const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
    const scopes: ListScope[] = [
        { kind: 'dfo' },
        { kind: 'class', id: 'FinancialFlow' },
        { kind: 'class', id: 'FinancialFlowTypeEnum' },
        { kind: 'class', id: 'financialFlowType' },
        { kind: 'class', id: 'Buyback' },
        { kind: 'class', id: 'NoSuchClass' },
    ];
    assert.deepEqual(
        scopes.map((scope) => listScopeExists(model, scope)),
        [true, true, true, false, false, false],
    );
});

test('a term the model lacks waits on the terms list only while base is on and it is not in', () => {
    const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
    const outside = { kind: 'node', id: 'Count_Thing' } as const;
    assert.equal(awaitsTerms(model, outside, true, false), true);
    assert.equal(awaitsTerms(model, outside, true, true), false);
    assert.equal(awaitsTerms(model, outside, false, false), false);
    assert.equal(awaitsTerms(model, { kind: 'node', id: 'FinancialFlow' }, true, false), false);
    assert.equal(
        awaitsTerms(model, { kind: 'dataset', id: 'provenance/Gone' }, true, false),
        false,
    );
});

test('the base switch sets or clears base and keeps every other parameter', () => {
    assert.equal(
        switchBase('?node=FinancialFlow&show=all', true),
        '?node=FinancialFlow&show=all&base=1',
    );
    assert.equal(switchBase('?class=X&base=1&split=a', false), '?class=X&split=a');
    assert.equal(switchBase('?base=1', false), '');
    assert.equal(switchBase('', true), '?base=1');
    assert.equal(switchBase('?base=1', true), '?base=1');
});
