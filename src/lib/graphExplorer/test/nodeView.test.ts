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
    TOO_LARGE,
    type NodeViewState,
    type Servable,
} from '../load.ts';
import {
    awaitedDataset,
    boxGaps,
    centreModel,
    centreNodes,
    classListGaps,
    leftOutLine,
    leftOutProperties,
    openLineCut,
    pictureCuts,
    routeCentre,
    viewCompleteness,
    COMPLETE,
    DESCENDANTS,
    LINKS_LOADING,
    LINKS_MISSING,
    type CentreRoute,
    type NodeViewFailure,
} from '../nodeView.ts';
import { nodeBoxes } from '../focus.ts';
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
        const { completeness } = route;
        const links =
            completeness.state === 'unresolved' && completeness.loading
                ? 'loading'
                : completeness.state;
        if (line === null) return { draws, links, line: null };
        if (line.kind === 'refused') return { draws, links, line: line.refusal };
        return { draws, links, line: line.retrying ? 'retrying' : 'failed' };
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
        [
            'dfo term',
            node('FinancialFlow'),
            null,
            null,
            { draws: 'full', links: 'complete', line: null },
        ],
        [
            'dfo term',
            node('FinancialFlow'),
            ready,
            null,
            { draws: 'full', links: 'complete', line: null },
        ],
        [
            'dataset',
            { kind: 'dataset', id: 'provenance/OECDDAC1' },
            null,
            null,
            { draws: 'full', links: 'complete', line: null },
        ],
        // A held base term paints from the full model and redraws once its view lands. A
        // refusal other than notHeld, which the picture would contradict, is its line.
        ['held', node('amount'), null, null, { draws: 'full', links: 'loading', line: null }],
        ['held', node('amount'), LOADING, null, { draws: 'full', links: 'loading', line: null }],
        [
            'held',
            node('amount'),
            NOT_HELD,
            null,
            { draws: 'full', links: 'unresolved', line: null },
        ],
        [
            'held',
            node('amount'),
            NOT_SERVED,
            null,
            { draws: 'full', links: 'unresolved', line: 'notServed' },
        ],
        [
            'held',
            node('amount'),
            TOO_LARGE,
            null,
            { draws: 'full', links: 'unresolved', line: 'tooLarge' },
        ],
        [
            'held',
            node('amount'),
            failed,
            null,
            { draws: 'full', links: 'unresolved', line: 'failed' },
        ],
        [
            'held',
            node('amount'),
            LOADING,
            failed,
            { draws: 'full', links: 'loading', line: 'retrying' },
        ],
        ['held', node('amount'), ready, failed, { draws: 'centre', links: 'complete', line: null }],
        // A term the document lacks waits, or reads its refusal.
        ['outside', node(SERIES), null, null, { kind: 'loading', waiting: null }],
        ['outside', node(SERIES), waiting, null, { kind: 'loading', waiting: waiting.waiting }],
        [
            'outside',
            node(SERIES),
            failed,
            null,
            { draws: 'full', links: 'unresolved', line: 'failed' },
        ],
        // A retry keeps the failed picture and its line, so focus stays on Try Again.
        [
            'outside',
            node(SERIES),
            LOADING,
            failed,
            { draws: 'full', links: 'loading', line: 'retrying' },
        ],
        [
            'outside',
            node(SERIES),
            waiting,
            failed,
            { draws: 'full', links: 'loading', line: 'retrying' },
        ],
        ['outside', node(SERIES), ready, null, { draws: 'centre', links: 'complete', line: null }],
        // A refused term the usage documents name keeps its use, with the refusal as a line.
        [
            'named',
            node(SERIES),
            NOT_HELD,
            null,
            { draws: 'full', links: 'unresolved', line: 'notHeld' },
        ],
        [
            'named',
            node(SERIES),
            NOT_SERVED,
            null,
            { draws: 'full', links: 'unresolved', line: 'notServed' },
        ],
        [
            'named',
            node(SERIES),
            ORIGIN_NOT_SERVED,
            null,
            { draws: 'full', links: 'unresolved', line: 'originNotServed' },
        ],
        // A refused term a loaded terms list holds keeps its heading, with the refusal as a line.
        [
            'listed',
            node(unnamed),
            NOT_SERVED,
            null,
            { draws: 'full', links: 'unresolved', line: 'notServed' },
        ],
        // Any other refused term shows the refusal alone.
        ['unnamed', node(unnamed), TOO_LARGE, null, { kind: 'refused', refusal: 'tooLarge' }],
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
        const listed = name === 'listed';
        assert.deepEqual(
            drawn(routeCentre(full, centre, state, { lastFailure, listed })),
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

test('a node view is complete with no capped listing, and partial with any', () => {
    const view = (capped: SchemaNodeView['capped']): SchemaNodeView => ({
        ...seriesView,
        capped,
    });
    assert.deepEqual(viewCompleteness(view([])), { state: 'complete' });
    const walk = [{ ref: SERIES, property: DESCENDANTS }];
    assert.deepEqual(viewCompleteness(view(walk)), { state: 'partial', capped: walk });
});

test('a capped property the centre does not hold reads as left out, and no listing does', () => {
    const USA = 'country/USA';
    const centre = node(USA, {
        types: ['Country'],
        other_properties: { nameWithLanguage: [{ value: 'United States@en' }] },
    });
    const capped = [
        { ref: 'Country', property: 'geoJsonCoordinates' },
        { ref: USA, property: DESCENDANTS },
        { ref: USA, property: 'geoJsonCoordinates' },
        { ref: USA, property: 'geoJsonCoordinatesDP1' },
        { ref: USA, property: 'nameWithLanguage' },
        { ref: USA, property: 'rangeIncludes' },
        { ref: USA, property: 'typeOf' },
        { ref: USA, property: 'typeOf/rangeIncludes' },
    ];
    const leftOut = leftOutProperties({ state: 'partial', capped }, centre);
    assert.deepEqual(leftOut, ['geoJsonCoordinates', 'geoJsonCoordinatesDP1']);
    assert.deepEqual(leftOutProperties(COMPLETE, centre), []);
    assert.deepEqual(leftOutProperties(LINKS_MISSING, centre), []);

    const line = leftOutLine(leftOut);
    assert.ok(
        leftOut.every((property) => line?.includes(property)),
        line ?? 'no line',
    );
    assert.equal(leftOutLine([]), null);
});

test("a box and a class's list name the gaps their listings leave", () => {
    const CLASS = 'Person';
    const view = (capped: SchemaNodeView['capped']): SchemaNodeView => ({
        generation: null,
        centre: node(CLASS, {
            types: ['Class'],
            sub_class_of: ['Thing'],
            declared_by: 'base',
            other_properties: { geoJsonCoordinates: [{ value: '[0, 0]' }] },
        }),
        nodes: [
            node('Thing', { types: ['Class'] }),
            node('Adult', { types: ['Class'], sub_class_of: [CLASS] }),
            node('Senior', { types: ['Class'], sub_class_of: ['Adult'] }),
        ],
        capped,
    });
    const gapsOf = (capped: SchemaNodeView['capped']) => {
        const each = view(capped);
        const completeness = viewCompleteness(each);
        const boxes = nodeBoxes(centreModel(full, each), CLASS);
        return Object.fromEntries(
            boxes.map((box) => [box.key, boxGaps(box, CLASS, completeness).join(' ')]),
        );
    };
    /** What the line over the picture names, with each cut box by its key. */
    const cutsOn = (capped: SchemaNodeView['capped']) => {
        const each = view(capped);
        const model = centreModel(full, each);
        const boxes = nodeBoxes(model, CLASS);
        const { lists, walk } = pictureCuts(model, CLASS, boxes, viewCompleteness(each));
        const keyOf = new Map(boxes.map((box) => [box.title, box.key]));
        return { lists: lists.map((name) => keyOf.get(name) ?? name), walk };
    };

    assert.deepEqual(gapsOf([]), { up: '', measured: '', split: '', down: '' });
    // With the direct listing capped, its box is cut and the walk below stops with it.
    assert.deepEqual(
        gapsOf([
            { ref: CLASS, property: 'subClassOf' },
            { ref: CLASS, property: DESCENDANTS },
        ]),
        { up: '', measured: 'descendants', split: 'descendants', down: 'capped' },
    );
    assert.deepEqual(
        gapsOf([
            { ref: CLASS, property: 'domainIncludes' },
            { ref: CLASS, property: DESCENDANTS },
        ]),
        { up: '', measured: 'capped descendants', split: 'capped descendants', down: '' },
    );
    // The direct listing capped alone cuts the walk below it too.
    assert.deepEqual(gapsOf([{ ref: CLASS, property: 'subClassOf' }]), {
        up: '',
        measured: 'descendants',
        split: 'descendants',
        down: 'capped',
    });
    assert.deepEqual(cutsOn([{ ref: CLASS, property: 'subClassOf' }]), {
        lists: ['down'],
        walk: true,
    });
    assert.deepEqual(
        cutsOn([
            { ref: CLASS, property: 'domainIncludes' },
            { ref: CLASS, property: DESCENDANTS },
        ]),
        { lists: ['measured', 'split'], walk: true },
    );
    // A cut open property marks its panel line and leaves the boxes whole.
    const open = [{ ref: CLASS, property: 'geoJsonCoordinates' }];
    assert.deepEqual(gapsOf(open), { up: '', measured: '', split: '', down: '' });
    assert.ok(openLineCut(viewCompleteness(view(open)), CLASS, 'geoJsonCoordinates'));
    assert.equal(openLineCut(viewCompleteness(view(open)), CLASS, 'name'), false);
    assert.deepEqual(cutsOn(open).walk, false);
    assert.equal(cutsOn(open).lists.length, 1);
    // A cap no drawn listing reads, on the centre or another node, cuts nothing.
    for (const capped of [
        [{ ref: CLASS, property: 'containedInPlace' }],
        [{ ref: 'Adult', property: DESCENDANTS }],
    ]) {
        assert.deepEqual(gapsOf(capped), { up: '', measured: '', split: '', down: '' });
        assert.deepEqual(cutsOn(capped), { lists: [], walk: false });
    }
    const [box] = nodeBoxes(centreModel(full, view([])), CLASS);
    assert.ok(box);
    assert.deepEqual(boxGaps(box, CLASS, LINKS_MISSING), ['unresolved']);
    assert.deepEqual(boxGaps(box, CLASS, LINKS_LOADING), ['unresolved']);
    assert.deepEqual(boxGaps(box, CLASS, COMPLETE), []);

    const listGaps = (capped: SchemaNodeView['capped']) =>
        classListGaps(CLASS, viewCompleteness(view(capped)));
    assert.deepEqual(listGaps([{ ref: CLASS, property: 'domainIncludes' }]), ['capped']);
    assert.deepEqual(listGaps([{ ref: CLASS, property: DESCENDANTS }]), ['descendants']);
    assert.deepEqual(listGaps([{ ref: CLASS, property: 'subClassOf' }]), ['descendants']);
    assert.deepEqual(listGaps([{ ref: CLASS, property: 'rangeIncludes' }]), []);
    assert.deepEqual(classListGaps(CLASS, LINKS_MISSING), ['unresolved']);
});

test('a typeOf cap on the centre marks its members incomplete, and the line names them', () => {
    const LIST = 'undata/SEX';
    const view = (capped: SchemaNodeView['capped']): SchemaNodeView => ({
        generation: null,
        centre: node(LIST, {
            types: ['Class'],
            declared_by: 'un_system',
            instances: { refs: ['undata/SEX-F', 'undata/SEX-M'], complete: true },
        }),
        nodes: [],
        capped,
    });
    const read = (capped: SchemaNodeView['capped']) => {
        const each = view(capped);
        const model = centreModel(full, each);
        return {
            complete: model.membersComplete(LIST),
            lists: pictureCuts(model, LIST, nodeBoxes(model, LIST), viewCompleteness(each)).lists,
        };
    };
    assert.deepEqual(read([]), { complete: true, lists: [] });
    const cut = read([{ ref: LIST, property: 'typeOf' }]);
    assert.equal(cut.complete, false);
    assert.equal(cut.lists.length, 1);
    // On another node, typeOf cuts nothing drawn here.
    assert.deepEqual(read([{ ref: 'Thing', property: 'typeOf' }]), { complete: true, lists: [] });
});

test("a cap on a property's range classes or a value's type classes cuts the box listing them", () => {
    const gapsAround = (centre: SchemaNode, nodes: SchemaNode[], property: string) => {
        const each: SchemaNodeView = {
            generation: null,
            centre,
            nodes,
            capped: [{ ref: centre.ref, property }],
        };
        const model = centreModel(full, each);
        return Object.fromEntries(
            nodeBoxes(model, centre.ref).map((box) => [
                box.key,
                boxGaps(box, centre.ref, viewCompleteness(each)).join(' '),
            ]),
        );
    };
    const PROPERTY = 'undata/testRange';
    const property = node(PROPERTY, { types: ['Property'], range_includes: ['Person'] });
    assert.equal(gapsAround(property, [], 'rangeIncludes/subClassOf+').right, 'capped');
    assert.equal(gapsAround(property, [], 'typeOf/rangeIncludes').right, '');

    const VALUE = 'undata/SEX-F';
    const value = node(VALUE, { types: ['undata/SEX'] });
    const list = node('undata/SEX', {
        types: ['Class'],
        instances: { refs: [VALUE], complete: true },
    });
    assert.equal(gapsAround(value, [list], 'typeOf/rangeIncludes').list, 'capped');
    assert.equal(gapsAround(value, [list], 'rangeIncludes/subClassOf+').list, '');
});
