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
    inBaseUsage,
    kindsDfoFirst,
    landedUsage,
    listHead,
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

    // The base document's terms name the terms the base browser has a page for.
    assert.deepEqual(
        ['age', SERIES, 'FinancialFlow'].map((id) => inBaseUsage(id, outside)),
        [true, false, false],
    );
    assert.equal(inBaseUsage('age', { un }), false);
});

test("a term takes its schema node's origin, else its usage document's, else the terms list's", () => {
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
