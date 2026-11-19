/**
 * `focus.ts` over the test documents: the boxes around each kind of term and
 * around a dataset, and a property's declared domain against its use.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    centreHeading,
    datasetBoxes,
    declaredDomain,
    definedNotUsed,
    headsOf,
    linkShape,
    nodeBoxes,
    openEntries,
    periodText,
    pictureLens,
    sharePercent,
    shareWords,
    type ArcProperty,
    type FocusBox,
} from '../focus.ts';
import { buildModel, type Model } from '../model.ts';
import { centreModel } from '../nodeView.ts';
import {
    readSchema,
    readUsage,
    type SchemaNode,
    type SchemaPattern,
    type SchemaTerm,
} from '../wire.ts';
import { baseUsageBody, schemaBody, unUsageBody, usageBody } from './fixtures.ts';
import { withListedParties } from './sheetFixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));

/** Each box as `key side: ids`, in picture order. */
const layout = (boxes: readonly FocusBox[]): string[] =>
    boxes.map((entry) => `${entry.key} ${entry.side}: ${entry.ids.join(' ')}`);

test('a kind of thing: broader above, its properties on the right by role, all opening its list', () => {
    const boxes = nodeBoxes(model, 'FinancialFlow');
    assert.deepEqual(
        boxes.map((entry) => [entry.key, entry.side]),
        [
            ['up', 'up'],
            ['measured', 'right'],
            ['between', 'right'],
            ['split', 'right'],
        ],
    );
    assert.deepEqual(boxes[0]?.ids, ['FinancingEvent']);
    assert.deepEqual(boxes[1]?.ids, ['amount', 'grantEquivalent', 'attributedAmount']);
    assert.deepEqual(boxes[2]?.ids, ['financingProvider', 'financingRecipient']);
    assert.ok(
        boxes.filter((entry) => entry.side === 'right').every((entry) => entry.more === 'list'),
    );
});

test('the properties a kind of thing declares that no dataset uses, counted; 0 off a class', () => {
    assert.equal(definedNotUsed(model, 'FinancialFlow'), 22);
    assert.equal(definedNotUsed(model, 'amount'), 0);
    assert.equal(definedNotUsed(model, 'noSuchTerm'), 0);
});

test('a property: broader above, used with on the left, its value list on the right', () => {
    assert.deepEqual(layout(nodeBoxes(model, 'climatePolicyObjective')), [
        'up up: policyObjective',
        'left left: FinancialFlow FinancialObligation',
        'right right: ClimateChangePolicyObjectiveEnum',
    ]);
    assert.deepEqual(layout(nodeBoxes(model, 'amount')), [
        'left left: FinancialFlow FinancialObligation',
        'right right: Number',
    ]);
});

test('a value list: the properties that take their value from it on the left', () => {
    assert.deepEqual(layout(nodeBoxes(model, 'FinancialFlowTypeEnum')), [
        'left left: financialFlowType netOf',
    ]);
});

test('a value: its value list and broader value above, narrower values below', () => {
    assert.deepEqual(layout(nodeBoxes(model, 'WriteDown')), [
        'list up: FinancialFlowTypeEnum',
        'up up: ClaimReduction',
        'left left: financialFlowType netOf',
        'down down: Buyback',
    ]);
    assert.ok(nodeBoxes(model, 'WriteDown').every((entry) => entry.more === 'panel'));
});

test('a class that lists its instances keeps its class picture and offers its value list', () => {
    const listed = withListedParties();

    assert.equal(listed.kind('Grouping'), 'class');
    assert.deepEqual(
        nodeBoxes(listed, 'Grouping').map((entry) => `${entry.key}:${entry.ids.length}`),
        ['up:1', 'left:3', 'down:6'],
    );
    assert.equal(definedNotUsed(listed, 'Grouping'), 7);

    assert.equal(listed.hasValueList('Grouping'), true);
    assert.deepEqual(listed.members('Grouping'), ['DACMembers', 'G20']);
    assert.equal(listed.valueListOf('DACMembers'), 'Grouping');
});

test('an enumeration with instances is a value list, and a class without them offers none', () => {
    assert.equal(model.kind('FinancialFlowTypeEnum'), 'valueList');
    assert.equal(model.hasValueList('FinancialFlowTypeEnum'), true);
    assert.equal(model.kind('Grouping'), 'class');
    assert.equal(model.hasValueList('Grouping'), false);
});

test('an id the model does not hold has no boxes', () => {
    assert.deepEqual(nodeBoxes(model, 'EconomicActivity'), []);
});

test('a dataset: what it is about on the left; measured, between and splits on the right', () => {
    const view = model.datasetView('provenance/OECDDAC2B');
    assert.ok(view);
    const boxes = datasetBoxes(view);
    assert.deepEqual(layout(boxes), [
        'about left: FinancialFlow',
        'measured right: amount',
        'between right: financingProvider financingRecipient',
        'split right: dac2bAidType financialFlowType nettingBasis dacTypeOfFinance',
    ]);
    assert.deepEqual(boxes.at(-1)?.values?.get('financialFlowType'), {
        used: 1,
        of: 14,
        complete: true,
    });
    assert.equal(boxes[0]?.values, null);
});

/** A StatVar chain from the centre (none for a dataset) to each entry's measured property. */
const statVars = (centre: ['populationType'] | null): Parameters<typeof linkShape>[0] => ({
    kind: 'statVars',
    centre,
    entries: ['measuredProperty'],
    statVars: 1,
    kinds: false,
    kindsOnly: 0,
});

/** The schema field holding each arc's objects on its subject's node. */
const ARC_FIELD: Record<ArcProperty, keyof SchemaNode> = {
    subClassOf: 'sub_class_of',
    subPropertyOf: 'sub_property_of',
    specializationOf: 'specialization_of',
    typeOf: 'types',
    rangeIncludes: 'range_includes',
};

/** Whether the schema document states `subject arc object`. */
const states = (model: Model, subject: string, arc: ArcProperty, object: string): boolean => {
    const objects = model.node(subject)?.[ARC_FIELD[arc]];
    return Array.isArray(objects) && objects.includes(object);
};

const listed = withListedParties();
const everyBox = (on: Model) =>
    on.nodes.flatMap((node) => nodeBoxes(on, node.ref).map((entry) => ({ id: node.ref, entry })));

test('every entry of every arc box holds the arc its box names, subject to object', () => {
    let entries = 0;
    for (const on of [model, listed]) {
        for (const { id, entry } of everyBox(on)) {
            const { via } = entry;
            if (via.kind !== 'arc') continue;
            assert.ok(via.properties.length > 0, `${id} ${entry.key} names no arc`);
            const triple = (other: string): [string, string] =>
                via.direction === 'out' ? [id, other] : [other, id];
            for (const other of entry.ids) {
                const [subject, object] = triple(other);
                assert.ok(
                    via.properties.some((arc) => states(on, subject, arc, object)),
                    `${subject} ${via.properties.join('|')} ${object} (${id} ${entry.key})`,
                );
                entries += 1;
            }
            for (const arc of via.properties) {
                assert.ok(
                    entry.ids.some((other) => {
                        const [subject, object] = triple(other);
                        return states(on, subject, arc, object);
                    }),
                    `${id} ${entry.key} names ${arc}, which no entry holds`,
                );
            }
            const ends = entry.triple.split(' → ');
            const [centreEnd, boxEnd] =
                via.direction === 'out' ? [ends[0], ends.at(-1)] : [ends.at(-1), ends[0]];
            assert.equal(centreEnd, on.label(id), `${id} ${entry.key}: ${entry.triple}`);
            assert.notEqual(boxEnd, on.label(id), `${id} ${entry.key}: ${entry.triple}`);
        }
    }
    assert.ok(entries > 50, `only ${entries} entries checked`);
});

test('a box’s link, bubble and sentence name the arcs it follows', () => {
    const find = (id: string, key: string) => nodeBoxes(model, id).find((box) => box.key === key);
    type Via = Parameters<typeof linkShape>[0];
    const arc = (property: ArcProperty, direction: 'in' | 'out'): Via => ({
        kind: 'arc',
        properties: [property],
        direction,
    });
    const rows: [string, string, Via, string[]][] = [
        ['FinancialFlow', 'up', arc('subClassOf', 'out'), ['subClassOf']],
        ['FinancingEvent', 'down', arc('subClassOf', 'in'), ['subClassOf']],
        ['WriteDown', 'list', arc('typeOf', 'out'), ['typeOf']],
        ['WriteDown', 'up', arc('specializationOf', 'out'), ['specializationOf']],
        ['Country', 'left', arc('rangeIncludes', 'in'), ['rangeIncludes']],
        [
            'WriteDown',
            'left',
            { kind: 'valueList', list: 'FinancialFlowTypeEnum' },
            ['rangeIncludes', 'typeOf'],
        ],
        [
            'FinancialFlow',
            'measured',
            {
                kind: 'statVars',
                centre: ['populationType'],
                entries: ['measuredProperty'],
                statVars: 474,
                kinds: false,
                kindsOnly: 0,
            },
            ['populationType', 'measuredProperty'],
        ],
    ];
    for (const [id, key, via, arcs] of rows) {
        const entry = find(id, key);
        assert.ok(entry, `${id} ${key}`);
        assert.deepEqual(entry.via, via, `${id} ${key}`);
        for (const name of arcs) {
            assert.ok(entry.triple.includes(name), `${id} ${key} bubble: ${name}`);
            assert.ok(entry.sentence.includes(name), `${id} ${key} sentence: ${name}`);
        }
    }

    const measured = find('FinancialFlow', 'measured');
    assert.deepEqual(measured && [measured.join, measured.triple, measured.sentence], [
        'measured as',
        'financial flow ← populationType · 474 StatVars · measuredProperty → each of these',
        'Graph link: 474 StatVars have financial flow as their populationType and each entry as their measuredProperty.',
    ]);
});

test('each half of a join carries the head its link points to, in reading order', () => {
    const rows: [Parameters<typeof linkShape>[0], boolean, [string | null, string | null]][] = [
        [{ kind: 'arc', properties: ['subClassOf'], direction: 'out' }, true, ['start', null]],
        [{ kind: 'arc', properties: ['subClassOf'], direction: 'out' }, false, [null, 'end']],
        [{ kind: 'arc', properties: ['subClassOf'], direction: 'in' }, true, [null, 'end']],
        [{ kind: 'arc', properties: ['subClassOf'], direction: 'in' }, false, ['start', null]],
        [{ kind: 'valueList', list: 'FinancialFlowTypeEnum' }, false, ['end', 'start']],
        [statVars(['populationType']), false, ['start', 'end']],
        [statVars(null), true, ['start', null]],
        [statVars(null), false, [null, 'end']],
    ];
    for (const [via, boxFirst, heads] of rows) {
        assert.deepEqual(
            headsOf(linkShape(via), boxFirst),
            heads,
            `${JSON.stringify(via)} ${boxFirst}`,
        );
    }
});

/** Whether a pattern's StatVars name `id` by the StatVar arc. */
const patternNames = (pattern: SchemaPattern, arc: string, id: string): boolean =>
    ({
        populationType: pattern.population_type === id,
        measuredProperty: pattern.measured_property === id,
        observationProperties: pattern.observation_properties.includes(id),
        constraintProperties: pattern.constraint_properties.includes(id),
    })[arc] ?? false;

test('every entry of a StatVar box shares a pattern with the centre by the arcs its box names', () => {
    const patterns = model.datasets.flatMap((dataset) => dataset.patterns);
    const kindsOf = (id: string): Set<string> => {
        const seen = new Set([id]);
        for (const next of seen) for (const child of model.narrower(next)) seen.add(child);
        return seen;
    };
    let checked = 0;
    for (const { id, entry } of everyBox(model)) {
        const { via } = entry;
        if (via.kind !== 'statVars' || via.centre === null) continue;
        const about = model.kind(id) === 'class' ? kindsOf(id) : new Set([id]);
        let onlyKinds = 0;
        for (const other of entry.ids) {
            const linking = patterns.filter(
                (pattern) =>
                    via.entries.some((arc) => patternNames(pattern, arc, other)) &&
                    [...about].some((centre) =>
                        via.centre?.some((arc) => patternNames(pattern, arc, centre)),
                    ),
            );
            assert.ok(linking.length > 0, `${id} ${entry.key}: ${other}`);
            if (model.kind(id) === 'class' && !linking.some((p) => p.population_type === id)) {
                onlyKinds += 1;
            }
            checked += 1;
        }
        assert.equal(via.kindsOnly, onlyKinds, `${id} ${entry.key}`);
        assert.deepEqual(linkShape(via), { dashed: true, heads: 'outward' });
    }
    assert.ok(checked > 20, `only ${checked} entries checked`);
});

test('a box backed by two arcs names both, and a value’s "Set with" passes through its list', () => {
    const body = schemaBody() as { nodes: Record<string, unknown>[] };
    const flow = body.nodes.find((node) => node.ref === 'FinancialFlow');
    assert.ok(flow);
    flow.specialization_of = ['FinancialObligation'];
    const edited = buildModel(readSchema(body), readUsage(usageBody()));
    const up = nodeBoxes(edited, 'FinancialFlow').find((entry) => entry.key === 'up');
    assert.deepEqual(up?.via, {
        kind: 'arc',
        properties: ['subClassOf', 'specializationOf'],
        direction: 'out',
    });

    const setWith = nodeBoxes(model, 'WriteDown').find((entry) => entry.key === 'left');
    assert.deepEqual(setWith?.via, { kind: 'valueList', list: 'FinancialFlowTypeEnum' });
    assert.deepEqual(linkShape({ kind: 'valueList', list: 'FinancialFlowTypeEnum' }), {
        dashed: true,
        heads: 'inward',
    });
    for (const property of setWith?.ids ?? []) {
        assert.ok(states(model, property, 'rangeIncludes', 'FinancialFlowTypeEnum'));
    }
    assert.ok(states(model, 'WriteDown', 'typeOf', 'FinancialFlowTypeEnum'));
});

test('a class box reached partly through narrower classes carries a note; one reached directly does not', () => {
    const measured = (id: string) => nodeBoxes(model, id).find((entry) => entry.key === 'measured');
    assert.notEqual(measured('FinancingEvent')?.note, null);
    assert.equal(measured('FinancialFlow')?.note, null);
});

test('a dataset box counts the dataset’s StatVars that name its entries', () => {
    const view = model.datasetView('provenance/OECDDAC2B');
    assert.ok(view);
    for (const entry of datasetBoxes(view)) {
        assert.equal(entry.via.kind, 'statVars');
        if (entry.via.kind !== 'statVars') continue;
        assert.equal(entry.via.centre, null);
        assert.ok(entry.via.statVars > 0 && entry.via.statVars <= view.statVarCount);
        assert.deepEqual(linkShape(entry.via), { dashed: true, heads: 'box' });
    }
});

test('a declared domain shows only where it differs from the classes in use', () => {
    assert.deepEqual(declaredDomain(model, 'climatePolicyObjective'), ['FinancingEvent']);
    assert.equal(declaredDomain(model, 'amount')?.includes('EconomicActivity'), true);
    assert.equal(declaredDomain(model, 'financialFlowType'), null);
    assert.equal(declaredDomain(model, 'NotANode'), null);
});

test('broader and range boxes order their entries by use, as every other box does', () => {
    const body = schemaBody() as { nodes: Record<string, unknown>[] };
    const base = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
    const unused = (kind: 'class' | 'property') =>
        body.nodes
            .map((node) => String(node.ref))
            .find((id) => base.kind(id) === kind && base.usage(id).total === 0);
    const unusedClass = unused('class');
    const unusedProperty = unused('property');
    assert.ok(unusedClass && unusedProperty);

    const provider = body.nodes.find((node) => node.ref === 'financingProvider');
    assert.ok(provider);
    provider.range_includes = [unusedClass, 'FinancialFlow'];
    provider.sub_property_of = [unusedProperty, 'amount'];
    const edited = buildModel(readSchema(body), readUsage(usageBody()));

    const boxes = nodeBoxes(edited, 'financingProvider');
    assert.deepEqual(boxes.find((entry) => entry.key === 'right')?.ids, [
        'FinancialFlow',
        unusedClass,
    ]);
    assert.deepEqual(boxes.find((entry) => entry.key === 'up')?.ids, ['amount', unusedProperty]);
});

const SERIES = 'undata/eclac/SERIES-INSUF_PENSION';
const SERIES_CLASS = 'undata/eclac/SERIES';

const baseUsage = readUsage(baseUsageBody());
const unUsage = readUsage(unUsageBody());
const full = buildModel(readSchema(schemaBody()), readUsage(usageBody()), baseUsage, unUsage);

/** A schema node with every list empty and `fields` set. */
const viewNode = (ref: string, fields: Partial<SchemaNode>): SchemaNode => ({
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

test('a UN series is a value under its series class, with what its StatVars measure and split by', () => {
    const model = centreModel(full, {
        generation: null,
        centre: viewNode(SERIES, {
            label: 'Older adults receiving insufficient pensions',
            types: [SERIES_CLASS],
            declared_by: 'un_system',
        }),
        nodes: [
            viewNode(SERIES_CLASS, {
                types: ['Class'],
                sub_class_of: ['Enumeration'],
                instances: { refs: [SERIES], complete: false },
            }),
        ],
        capped: [],
    });
    assert.equal(model.kind(SERIES), 'value');
    assert.deepEqual(layout(nodeBoxes(model, SERIES)), [
        `list up: ${SERIES_CLASS}`,
        'measured right: value',
        'split right: sex',
    ]);
    const measured = nodeBoxes(model, SERIES).find((entry) => entry.key === 'measured');
    assert.equal(measured?.more, 'panel');
    assert.deepEqual(measured?.via, {
        kind: 'statVars',
        centre: ['populationType'],
        entries: ['measuredProperty'],
        statVars: 4,
        kinds: false,
        kindsOnly: 0,
    });
});

test('the centre heading reads a dataset, a model term, a usage term and an unknown id', () => {
    const dataset = centreHeading(model, { kind: 'dataset', id: 'provenance/OECDDAC2B' });
    assert.deepEqual(
        [dataset?.name, dataset?.sub],
        [model.label('provenance/OECDDAC2B'), { kind: 'statVars', count: 14 }],
    );
    assert.equal(centreHeading(model, { kind: 'dataset', id: 'provenance/Gone' }), null);

    const term = centreHeading(model, { kind: 'node', id: 'FinancialFlow' });
    assert.deepEqual([term?.name, term?.declaredBy], [model.label('FinancialFlow'), 'dfo']);

    // A term only the usage documents name takes its kind from its types, and its name else its dcid.
    const age = centreHeading(full, { kind: 'node', id: 'age' });
    const person = centreHeading(full, { kind: 'node', id: 'Person' });
    const series = centreHeading(full, { kind: 'node', id: SERIES });
    assert.deepEqual(
        [age?.kind, age?.name, age?.sub],
        [
            centreHeading(model, { kind: 'node', id: 'amount' })?.kind,
            'Age',
            { kind: 'dcid', id: 'age' },
        ],
    );
    assert.equal(person?.name, 'Person');
    assert.notEqual(person?.kind, age?.kind);
    assert.equal(series?.name, 'Older adults receiving insufficient pensions');
    assert.notEqual(series?.kind, age?.kind);
    assert.notEqual(series?.kind, person?.kind);

    // No usage document names it.
    const unknown = centreHeading(full, { kind: 'node', id: 'ABSState' });
    assert.deepEqual([unknown?.declaredBy, unknown?.name], [null, 'ABSState']);
    assert.notEqual(unknown?.kind, age?.kind);

    // With the loaded documents, a usage term takes its document's origin, and a
    // term only a terms list holds takes its row's kind, label and origin.
    const row = {
        ref: 'ABSState',
        label: 'Australian state',
        types: ['Class' as const],
        provenances: [],
        declared_by: 'base',
    };
    const sources = { usage: { base: baseUsage, un: unUsage }, terms: [row] };
    assert.equal(
        centreHeading(full, { kind: 'node', id: SERIES }, sources)?.declaredBy,
        'un_system',
    );
    assert.equal(centreHeading(full, { kind: 'node', id: 'age' }, sources)?.declaredBy, 'base');
    const listed = centreHeading(full, { kind: 'node', id: 'ABSState' }, sources);
    assert.deepEqual(
        [listed?.kind, listed?.name, listed?.declaredBy],
        [`${person?.kind} in base Data Commons`, 'Australian state', 'base'],
    );
});

test('a term the model holds no node for is headed by its kind and where its origin sits', () => {
    const headingFor = (declaredBy: string | null, types: SchemaTerm['types'] = ['Class']) => {
        const row = {
            ref: 'ABSState',
            label: 'Age',
            types,
            provenances: [],
            declared_by: declaredBy,
        };
        const sources = { usage: {}, terms: [row] };
        return centreHeading(full, { kind: 'node', id: 'ABSState' }, sources)?.kind;
    };
    assert.deepEqual(
        [
            headingFor('base'),
            headingFor('un_system'),
            headingFor('un_system', ['Property']),
            headingFor('some_new_origin'),
            headingFor(null),
        ],
        [
            'Kind of thing in base Data Commons',
            'Kind of thing in the UN System Data Commons',
            'Property in the UN System Data Commons',
            'Kind of thing in another origin',
            'Kind of thing',
        ],
    );
    // A usage term takes the place of the document naming it; a model node keeps its kind alone.
    const sources = { usage: { base: baseUsage, un: unUsage }, terms: [] };
    assert.equal(
        centreHeading(full, { kind: 'node', id: 'age' }, sources)?.kind,
        'Property in base Data Commons',
    );
    assert.equal(
        centreHeading(full, { kind: 'node', id: 'FinancialFlow' }, sources)?.kind,
        'Kind of thing',
    );
});

test('a value no value list holds is headed by its types, a list member by its kind', () => {
    const body = schemaBody() as { nodes: Record<string, unknown>[] };
    const template = body.nodes.find((node) => node.ref === 'Number');
    assert.ok(template);
    const add = (ref: string, label: string | null, types: string[]) =>
        body.nodes.push({ ...template, ref, label, types });
    const country = body.nodes.find((node) => node.ref === 'Country');
    assert.ok(country);
    country.label = 'Country';
    // The fixture's Place has no label, so it reads as its dcid, as Number's DataType does.
    add('country/USA', 'United States', ['Country', 'Place']);
    add('flow/1', null, ['FinancialFlow']);
    const edited = buildModel(readSchema(body), readUsage(usageBody()));
    const kind = (id: string) => centreHeading(edited, { kind: 'node', id })?.kind;
    assert.deepEqual(
        [kind('country/USA'), kind('flow/1'), kind('CurrencyCHF'), kind('Number')],
        ['Country, Place', edited.label('FinancialFlow'), 'Value', 'DataType'],
    );
    assert.notEqual(edited.label('FinancialFlow'), 'FinancialFlow');
    // A UN series the model knows only from its usage document reads as its series class.
    assert.equal(centreHeading(full, { kind: 'node', id: SERIES })?.kind, 'undata/eclac/SERIES');
});

test('a dataset’s own view under its own filter carries no marks', () => {
    const dac1 = { kind: 'dataset', id: 'provenance/OECDDAC1' } as const;
    assert.equal(pictureLens({ kind: 'dataset', id: dac1.id }, dac1), null);
    assert.equal(pictureLens({ kind: 'dataset', id: 'provenance/OECDDAC2A' }, dac1), dac1.id);
    assert.equal(pictureLens({ kind: 'node', id: 'FinancialFlow' }, dac1), dac1.id);
    assert.equal(pictureLens({ kind: 'node', id: 'FinancialFlow' }, { kind: 'all' }), null);
});

test('open properties read with their labels, held nodes as links and the rest as text', () => {
    // isProvisional and True are not nodes of the fixture, so both read as their dcids.
    assert.deepEqual(openEntries(model, 'CurrencyCHF'), [
        {
            property: 'currencyStatus',
            label: 'currency status',
            values: [{ kind: 'node', id: 'CurrencyStatusCurrent', name: 'current' }],
        },
        {
            property: 'dacCode',
            label: 'DAC code',
            values: [
                { kind: 'text', text: '11' },
                { kind: 'text', text: '70' },
            ],
        },
        {
            property: 'iso4217AlphaCode',
            label: 'ISO 4217 currency code',
            values: [{ kind: 'text', text: 'CHF' }],
        },
        {
            property: 'iso4217NumericCode',
            label: 'ISO 4217 currency number',
            values: [{ kind: 'text', text: '756' }],
        },
        {
            property: 'nationalCurrencyOf',
            label: 'national currency of',
            values: [
                { kind: 'text', text: 'country/CHE' },
                { kind: 'text', text: 'country/LIE' },
            ],
        },
    ]);
    assert.deepEqual(openEntries(model, 'combinesMethods'), [
        {
            property: 'isProvisional',
            label: 'isProvisional',
            values: [{ kind: 'text', text: 'True' }],
        },
    ]);
    assert.deepEqual(openEntries(model, 'AdministrativeArea'), []);
    assert.deepEqual(openEntries(model, 'NotANode'), []);
});

test('a share is a whole percentage, at least 1 when anything is used, and "under 1%" in words below half a percent', () => {
    assert.equal(sharePercent(1, 653), 1);
    assert.equal(sharePercent(0, 653), 0);
    assert.equal(sharePercent(5, 0), 0);
    assert.equal(sharePercent(14, 25), 56);

    // In words, a share below half a percent reads "under 1%" so a long tail does not read "1%".
    assert.equal(shareWords(1, 653), 'under 1%');
    assert.equal(shareWords(4, 653), '1%');
    assert.equal(shareWords(16_755, 28_037), '60%');
    assert.equal(shareWords(0, 653), '0%');
});

for (const [code, shown] of [
    ['P1Y', 'Yearly (P1Y)'],
    ['P3M', 'Quarterly (P3M)'],
    ['P1M', 'Monthly (P1M)'],
    ['P1D', 'Daily (P1D)'],
    ['P6M', 'P6M'],
    ['', ''],
] as const) {
    test(`the observation period ${code || '(empty)'} reads as ${shown || '(empty)'}`, () => {
        assert.equal(periodText(code), shown);
    });
}
