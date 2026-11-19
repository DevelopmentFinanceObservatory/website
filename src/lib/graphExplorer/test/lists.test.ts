/**
 * `lists.ts` over the test documents: the first-N rule, datasets by use, and
 * the origin of a dataset and of a term, and the base terms list.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    datasetHead,
    datasetOrigin,
    datasetsByUse,
    datasetsDfoFirst,
    filterNote,
    firstMatches,
    kindsDfoFirst,
    landedUsage,
    LIST_CEILING,
    listHead,
    listOnShow,
    termFilter,
    termOrigin,
} from '../lists.ts';
import { buildModel } from '../model.ts';
import { readSchema, readUsage, type SchemaNode, type SchemaTerm } from '../wire.ts';
import { baseUsageBody, schemaBody, unUsageBody, usageBody } from './fixtures.ts';

const DAC1 = 'provenance/OECDDAC1';
const DAC2A = 'provenance/OECDDAC2A';
const DAC2B = 'provenance/OECDDAC2B';
const CLIMATE = 'provenance/ONEClimateFinance';
const BIRTHS = 'dc/base/Adolescent_Birth_Rate';
const ECLAC = 'undata/p/ECLAC';
const SERIES = 'undata/eclac/SERIES-INSUF_PENSION';

const PERSON: SchemaNode = {
    ref: 'Person',
    label: null,
    description: null,
    types: ['Class'],
    alternate_name: [],
    sub_class_of: ['Thing'],
    sub_property_of: [],
    specialization_of: [],
    domain_includes: [],
    range_includes: [],
    classification_code: [],
    provenances: ['dc/base/Schema'],
    declared_by: 'base',
    instances: null,
    other_properties: {},
};

const schema = (() => {
    const document = readSchema(schemaBody());
    return { ...document, nodes: [...document.nodes, PERSON] };
})();

const ten = Array.from({ length: 10 }, (_, at) => at);

for (const { name, items, open, keep, shown, long } of [
    {
        name: 'a list no longer than its head shows whole',
        items: ten.slice(0, 8),
        open: false,
        keep: undefined,
        shown: ten.slice(0, 8),
        long: false,
    },
    {
        name: 'a longer list shows its head',
        items: ten,
        open: false,
        keep: undefined,
        shown: ten.slice(0, 8),
        long: true,
    },
    {
        name: 'a kept entry past the head joins the end',
        items: ten,
        open: false,
        keep: (n: number) => n === 9,
        shown: [...ten.slice(0, 8), 9],
        long: true,
    },
    {
        name: 'an open list shows whole',
        items: ten,
        open: true,
        keep: undefined,
        shown: ten,
        long: true,
    },
]) {
    test(`listHead: ${name}`, () => {
        const head = listHead(items, { open, keep });
        assert.deepEqual(head, { shown, total: items.length, long });
    });
}

test("a dataset's bars keep the filtered dataset past their head", () => {
    const uses = ten.map((at) => ({ dataset: `d${at}`, count: 10 - at }));
    const refs = (dataset: string | null, open = false) =>
        datasetHead(uses, { open, dataset }).shown.map((use) => use.dataset);
    const head = uses.slice(0, 8).map((use) => use.dataset);
    assert.deepEqual(refs('d9'), [...head, 'd9']);
    assert.deepEqual(refs('d2'), head);
    assert.deepEqual(refs(null), head);
    assert.equal(refs('d9', true).length, 10);
});

test('datasets come most StatVars first, then by label, whatever the document order', () => {
    const base = readUsage(baseUsageBody());
    const un = readUsage(unUsageBody());
    // ECLAC has 4 StatVars, so give the base dataset 4 too, and list UN first.
    const tied = {
        ...base,
        provenances: base.provenances.map((p) => ({ ...p, stat_var_count: 4 })),
    };
    const model = buildModel(schema, readUsage(usageBody()), un, tied);
    assert.deepEqual(
        datasetsByUse(model).map((dataset) => dataset.ref),
        [DAC1, DAC2A, CLIMATE, DAC2B, BIRTHS, ECLAC],
    );
});

test("the start screen lists the DFO's datasets first, then the outside ones, each most used first", () => {
    const dfo = readUsage(usageBody());
    const un = readUsage(unUsageBody());
    const base = readUsage(baseUsageBody());
    // The base dataset outnumbers every DFO dataset.
    const large = {
        ...base,
        provenances: base.provenances.map((p) => ({ ...p, stat_var_count: 5000 })),
    };
    const model = buildModel(schema, dfo, un, large);
    const refs = (outside: Parameters<typeof datasetsDfoFirst>[1]) =>
        datasetsDfoFirst(model, outside).map((dataset) => dataset.ref);
    assert.deepEqual(
        datasetsByUse(model).map((dataset) => dataset.ref),
        [BIRTHS, DAC1, DAC2A, CLIMATE, DAC2B, ECLAC],
    );
    assert.deepEqual(refs({ base: large, un }), [DAC1, DAC2A, CLIMATE, DAC2B, BIRTHS, ECLAC]);
    // A DFO-only model keeps its own order.
    const dfoOnly = buildModel(schema, dfo);
    assert.equal(datasetsDfoFirst(dfoOnly, {}), datasetsByUse(dfoOnly));
});

test('a dataset takes the origin of the usage document the model took it from', () => {
    const dfo = readUsage(usageBody());
    const base = readUsage(baseUsageBody());
    const un = readUsage(unUsageBody());
    // A base document that also lists a DFO ref loses to the DFO document's entry in the model.
    const overlapping = { ...base, provenances: [...base.provenances, { ...dfo.provenances[0]! }] };
    const model = buildModel(schema, dfo, overlapping, un);
    const outside = landedUsage({
        base: { status: 'ready', value: overlapping },
        un: { status: 'ready', value: un },
    });
    const originOf = (ref: string) => datasetOrigin(model.dataset(ref)!, outside);

    assert.equal(originOf(DAC1), null);
    assert.equal(originOf(BIRTHS), 'base');
    assert.equal(originOf(ECLAC), 'un_system');
    // An outside document still loading gives its datasets no origin.
    assert.equal(datasetOrigin(model.dataset(ECLAC)!, landedUsage({ base: null, un: null })), null);
});

test("a term takes its schema node's origin, else the terms list's, else its usage document's", () => {
    const base = readUsage(baseUsageBody());
    const un = readUsage(unUsageBody());
    const model = buildModel(schema, readUsage(usageBody()), un);
    const listed: SchemaTerm = {
        ref: 'undata/AGE',
        label: 'Age',
        types: ['Property'],
        provenances: [],
        declared_by: 'un_system',
    };
    const sources = (terms: readonly SchemaTerm[]) => ({ usage: { base, un }, terms });
    assert.equal(termOrigin(model, sources([]), 'Person'), 'base');
    // No terms list holds a UN series, so its usage document gives the origin.
    assert.equal(termOrigin(model, sources([]), SERIES), 'un_system');
    assert.equal(termOrigin(model, sources([]), 'gender'), 'base');
    assert.equal(termOrigin(model, sources([listed]), 'undata/AGE'), 'un_system');
    // UN patterns name the base property `value`, and its terms list row names the declarer.
    const value: SchemaTerm = { ...listed, ref: 'value', label: 'Value', declared_by: 'base' };
    assert.equal(termOrigin(model, sources([]), 'value'), 'un_system');
    assert.equal(termOrigin(model, sources([value]), 'value'), 'base');
    // Neither loaded yet.
    assert.equal(termOrigin(model, { usage: {}, terms: [] }, SERIES), null);
    assert.equal(termOrigin(model, sources([]), 'undata/AGE'), null);
});

test('the start screen lists the kinds of thing without an outside tag first, each group in the order given', () => {
    const base = readUsage(baseUsageBody());
    const un = readUsage(unUsageBody());
    const model = buildModel(schema, readUsage(usageBody()), base, un);
    const origin = (id: string) => termOrigin(model, { usage: { base, un }, terms: [] }, id);
    // Most used last, so the outside kinds come before the DFO's.
    const kinds = [...model.populationTypes()].reverse();
    assert.deepEqual(
        kindsDfoFirst(kinds, origin).map((kind) => kind.classId),
        ['FinancialObligation', 'FinancialFlow', SERIES, 'Person'],
    );
    const dfo = buildModel(schema, readUsage(usageBody()));
    assert.equal(kindsDfoFirst(dfo.populationTypes(), origin), dfo.populationTypes());
});

test('a list past the ceiling shows its first matches and counts them all', () => {
    // As many ids as the property `value` is used with across the UN System's series.
    const ids = Array.from({ length: 1_700 }, (_, index) => `undata/SERIES-${index}`);
    const all = firstMatches(ids);
    assert.equal(all.hits.length, LIST_CEILING);
    assert.equal(all.total, 1_700);
    assert.deepEqual(all.hits.slice(0, 2), ['undata/SERIES-0', 'undata/SERIES-1']);

    const model = { label: (id: string) => (id.endsWith('-7') ? 'Births' : id) };
    const filtered = firstMatches(ids, termFilter(model, '  births '));
    assert.deepEqual(filtered, { hits: ['undata/SERIES-7'], total: 1 });
    const byDcid = firstMatches(ids, termFilter(model, 'SERIES-16'));
    assert.equal(byDcid.total, 111);
    assert.equal(byDcid.hits.length, LIST_CEILING);
    assert.equal(termFilter(model, '   '), null);
});

test('an open list past the ceiling shows the first 60, and a closed one its head', () => {
    // As many split combinations as WHO's patterns form.
    const groups = Array.from({ length: 230 }, (_, index) => index);
    const open = listOnShow(groups, { open: true });
    assert.equal(open.shown.hits.length, LIST_CEILING);
    assert.equal(open.shown.total, 230);
    const closed = listOnShow(groups, { open: false });
    assert.equal(closed.shown.hits.length, 8);
    assert.equal(closed.head.long, true);
});

test("a filtered list's note: no match only for a filter with text, else how to reach the rest", () => {
    const over = { hits: Array.from({ length: LIST_CEILING }), total: 1_700 };
    const none = { hits: [], total: 0 };
    assert.equal(filterNote('', none), null);
    assert.equal(filterNote('   ', none), null);
    assert.deepEqual(filterNote(' births ', none), { kind: 'noMatch', text: 'births' });
    assert.deepEqual(filterNote('', over), { kind: 'ceiling', then: 'Filter to find the rest.' });
    assert.deepEqual(filterNote('a', over), { kind: 'ceiling', then: 'Type more to narrow.' });
    assert.equal(filterNote('a', { hits: [1], total: 1 }), null);
});
