/**
 * `nodeView.ts`: the model for a centre the DFO document does not declare
 * joins the view's centre and neighbours to the DFO document's nodes, and
 * reads every usage document the full model holds.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import {
    LOADING,
    NOT_HELD,
    NOT_SERVED,
    ORIGIN_NOT_SERVED,
    type NodeViewState,
    type Servable,
} from '../load.ts';
import {
    awaitedDataset,
    centreModel,
    centreNodes,
    routeCentre,
    type CentreRoute,
    type NodeViewFailure,
} from '../nodeView.ts';
import { readSchema, readUsage, type SchemaNode, type SchemaNodeView } from '../wire.ts';
import { baseUsageBody, schemaBody, unUsageBody, usageBody } from './fixtures.ts';

const SERIES = 'undata/eclac/SERIES-INSUF_PENSION';
const SERIES_CLASS = 'undata/eclac/SERIES';

const node = (ref: string, fields: Partial<SchemaNode>): SchemaNode => ({
    ref,
    label: null,
    description: null,
    types: [],
    alternate_name: [],
    sub_class_of: [],
    sub_property_of: [],
    specialization_of: [],
    domain_includes: [],
    range_includes: [],
    classification_code: [],
    provenances: [],
    declared_by: null,
    instances: null,
    other_properties: {},
    ...fields,
});

const full = buildModel(
    readSchema(schemaBody()),
    readUsage(usageBody()),
    readUsage(baseUsageBody()),
    readUsage(unUsageBody()),
);

/** A UN series' view: its series class, and a stub of a class the DFO document holds. */
const seriesView: SchemaNodeView = {
    generation: 'un-generation',
    centre: node(SERIES, {
        label: 'Older adults receiving insufficient pensions',
        types: [SERIES_CLASS],
        provenances: ['undata/p/ECLAC'],
        declared_by: 'un_system',
    }),
    nodes: [
        node('FinancialFlow', { label: 'A stub', types: ['Class'] }),
        node(SERIES_CLASS, {
            label: 'ECLAC series',
            types: ['Class'],
            sub_class_of: ['Enumeration'],
            provenances: ['undata/p/ECLAC'],
            declared_by: 'un_system',
            instances: { refs: [SERIES], complete: false },
        }),
    ],
    capped: [],
};

test("a series' model holds the view's nodes beside the DFO document's, which win on a shared ref", () => {
    const model = centreModel(full, seriesView);
    assert.equal(model.kind(SERIES), 'value');
    assert.equal(model.node(SERIES)?.declared_by, 'un_system');
    assert.equal(model.kind(SERIES_CLASS), 'valueList');
    assert.equal(model.valueListOf(SERIES), SERIES_CLASS);
    assert.equal(model.membersComplete(SERIES_CLASS), false);
    assert.deepEqual(model.node('FinancialFlow'), full.node('FinancialFlow'));
    assert.equal(model.nodes.length, full.nodes.length + 2);
    assert.equal(model.generation, full.generation);
    // Held or outside stays a fact of the full model.
    assert.equal(full.node(SERIES), undefined);
});

test("a series' model reads the full model's usage, so the series has its measured and split properties", () => {
    const model = centreModel(full, seriesView);
    assert.equal(model.isPopulationType(SERIES), true);
    assert.deepEqual(model.usage(SERIES).total, 4);
    const { groups } = model.propertiesOf(SERIES);
    assert.deepEqual(
        groups.measured.map((entry) => entry.id),
        ['value'],
    );
    assert.deepEqual(
        groups.split.map((entry) => entry.id),
        ['sex'],
    );
    assert.equal(model.label('sex'), 'Sex');
});

test("the view's centre replaces a held node of the same ref", () => {
    const held = full.node('FinancialFlow');
    assert.ok(held);
    const centre = {
        ...held,
        sub_class_of: [...held.sub_class_of, 'Thing'],
        description: 'read live',
    };
    const nodes = centreNodes(full, { generation: null, centre, nodes: [held], capped: [] });
    assert.equal(nodes.length, full.nodes.length);
    assert.equal(nodes.filter((entry) => entry.ref === 'FinancialFlow').length, 1);
    assert.equal(
        nodes.find((entry) => entry.ref === 'FinancialFlow'),
        centre,
    );
});

test('each pair of full model and view builds once', () => {
    assert.equal(centreModel(full, seriesView), centreModel(full, seriesView));
    assert.notEqual(centreModel(full, seriesView), centreModel(full, { ...seriesView }));
});

test('a centre draws from the full model, its view, a wait or a refusal by what the DFO document holds', () => {
    const failed: NodeViewFailure = {
        status: 'failed',
        reason: 'timeout',
        message: 'The view could not be loaded: it timed out.',
        explanation: 'It timed out.',
    };
    const waiting: NodeViewState = {
        status: 'loading',
        waiting: { retryInMs: 2000, cause: 'busy' },
    };
    const ready: NodeViewState = { status: 'ready', value: seriesView };
    const node = (id: string) => ({ kind: 'node', id }) as const;
    const drawn = (route: CentreRoute) => {
        if (route.kind !== 'draw') return route;
        const draws = route.model === full ? 'full' : 'centre';
        const { line } = route;
        if (line === null) return { draws, line: null };
        if (line.kind === 'refused') return { draws, line: line.refusal };
        return { draws, line: line.retrying ? 'retrying' : 'failed' };
    };
    // A term no usage document names, which the schema lacks too.
    const unnamed = 'undata/eclac/SERIES-UNNAMED';
    const rows: [
        string,
        { kind: 'node' | 'dataset'; id: string },
        NodeViewState | null,
        NodeViewFailure | null,
        unknown,
    ][] = [
        // A DFO-declared term and a dataset draw from the full model at once.
        ['dfo term', node('FinancialFlow'), null, null, { draws: 'full', line: null }],
        ['dfo term', node('FinancialFlow'), ready, null, { draws: 'full', line: null }],
        [
            'dataset',
            { kind: 'dataset', id: 'provenance/OECDDAC1' },
            null,
            null,
            { draws: 'full', line: null },
        ],
        // A held base term paints from the full model and redraws once its view lands.
        ['held', node('amount'), null, null, { draws: 'full', line: null }],
        ['held', node('amount'), LOADING, null, { draws: 'full', line: null }],
        ['held', node('amount'), NOT_HELD, null, { draws: 'full', line: null }],
        ['held', node('amount'), NOT_SERVED, null, { draws: 'full', line: null }],
        ['held', node('amount'), failed, null, { draws: 'full', line: 'failed' }],
        ['held', node('amount'), LOADING, failed, { draws: 'full', line: 'retrying' }],
        ['held', node('amount'), ready, failed, { draws: 'centre', line: null }],
        // A term the document lacks waits, or reads its refusal.
        ['outside', node(SERIES), null, null, { kind: 'loading', waiting: null }],
        ['outside', node(SERIES), waiting, null, { kind: 'loading', waiting: waiting.waiting }],
        ['outside', node(SERIES), failed, null, { draws: 'full', line: 'failed' }],
        // A retry keeps the failed picture and its line, so focus stays on Try Again.
        ['outside', node(SERIES), LOADING, failed, { draws: 'full', line: 'retrying' }],
        ['outside', node(SERIES), waiting, failed, { draws: 'full', line: 'retrying' }],
        ['outside', node(SERIES), ready, null, { draws: 'centre', line: null }],
        // A refused term the usage documents name keeps its use, with the refusal as a line.
        ['named', node(SERIES), NOT_HELD, null, { draws: 'full', line: 'notHeld' }],
        ['named', node(SERIES), NOT_SERVED, null, { draws: 'full', line: 'notServed' }],
        [
            'named',
            node(SERIES),
            ORIGIN_NOT_SERVED,
            null,
            { draws: 'full', line: 'originNotServed' },
        ],
        // Any other refused term shows the refusal alone.
        ['unnamed', node(unnamed), NOT_HELD, null, { kind: 'refused', refusal: 'notHeld' }],
        [
            'unnamed',
            node(unnamed),
            ORIGIN_NOT_SERVED,
            null,
            { kind: 'refused', refusal: 'originNotServed' },
        ],
    ];
    for (const [name, centre, state, lastFailure, expected] of rows) {
        assert.deepEqual(
            drawn(routeCentre(full, centre, state, lastFailure)),
            expected,
            `${name} ${state?.status} ${lastFailure?.status}`,
        );
    }
    assert.equal(full.node('amount')?.declared_by, 'base');
    assert.notEqual(full.term(SERIES), undefined);
    assert.equal(full.term(unnamed), undefined);
});

test('a named dataset the full model lacks waits while an outside usage document is unsettled', () => {
    const dfoOnly = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
    const base = 'dc/base/Adolescent_Birth_Rate';
    const failed: Servable<unknown> = {
        status: 'failed',
        reason: 'unreachable',
        message: 'm',
        explanation: 'e',
    };
    const ready: Servable<unknown> = { status: 'ready', value: {} };
    const rows: [
        string,
        (string | null)[],
        Servable<unknown> | null,
        Servable<unknown> | null,
        string | null,
    ][] = [
        // A dataset outside usage may bring waits for it.
        ['centred, base loading', [base, null], LOADING, ready, base],
        ['filtered, UN not started', [null, base], ready, null, base],
        ['both named, the missing one', ['provenance/OECDDAC1', base], LOADING, LOADING, base],
        // Once every document has settled, the dataset is missing.
        ['all settled', [base, base], failed, NOT_SERVED, null],
        ['all ready', [base, null], ready, ready, null],
        // A dataset the model holds, or none named, gives null.
        ['held', ['provenance/OECDDAC1', 'provenance/OECDDAC2A'], LOADING, LOADING, null],
        ['none named', [null, null], LOADING, LOADING, null],
    ];
    for (const [name, ids, baseState, unState, expected] of rows) {
        assert.equal(
            awaitedDataset(dfoOnly, ids, { base: baseState, un: unState }),
            expected,
            name,
        );
    }
});
