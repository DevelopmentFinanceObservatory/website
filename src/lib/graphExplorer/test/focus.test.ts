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
    linkShape,
    nodeBoxes,
    openEntries,
    outsideKind,
    periodText,
    pictureLens,
    sharePercent,
    type ArcProperty,
    type FocusBox,
} from '../focus.ts';
import { buildModel, type Model } from '../model.ts';
import { readSchema, readUsage, readTerms, type SchemaNode, type SchemaPattern } from '../wire.ts';
import { schemaBody, usageBody, termsBody } from './fixtures.ts';
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
            assert.equal(linkShape(via).dashed, false);
        }
    }
    assert.ok(entries > 50, `only ${entries} entries checked`);
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
    assert.equal(up?.join.split(' or ').length, 2);

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

test('the centre heading reads a dataset, a model term, a base term and an unknown id', () => {
    const dataset = centreHeading(model, { kind: 'dataset', id: 'provenance/OECDDAC2B' });
    assert.deepEqual(
        [dataset?.name, dataset?.sub],
        [model.label('provenance/OECDDAC2B'), { kind: 'statVars', count: 14 }],
    );
    assert.equal(centreHeading(model, { kind: 'dataset', id: 'provenance/Gone' }), null);

    const term = centreHeading(model, { kind: 'node', id: 'FinancialFlow' });
    assert.deepEqual(
        [term?.name, term?.base, term?.term],
        [model.label('FinancialFlow'), false, undefined],
    );

    const baseTerms = readTerms(termsBody());
    const outside = 'ABSState';
    const base = centreHeading(model, { kind: 'node', id: outside }, baseTerms);
    assert.deepEqual(
        [base?.base, base?.term?.ref, base?.sub],
        [true, outside, { kind: 'dcid', id: outside }],
    );
    assert.notEqual(outsideKind(base?.term), outsideKind(undefined));

    // Without the terms list the same id reads as outside the model, with no term.
    const unknown = centreHeading(model, { kind: 'node', id: outside });
    assert.deepEqual([unknown?.base, unknown?.term, unknown?.name], [false, undefined, outside]);
    assert.notEqual(unknown?.kind, base?.kind);
});

test('a term outside the model is headed by the origin declaring it', () => {
    const headingFor = (declaredBy: string | null) => {
        const body = termsBody() as { terms: { ref: string; declared_by: string | null }[] };
        const term = body.terms.find((entry) => entry.ref === 'ABSState');
        assert.ok(term);
        term.declared_by = declaredBy;
        const heading = centreHeading(model, { kind: 'node', id: 'ABSState' }, readTerms(body));
        return [heading?.kind, heading?.base];
    };
    assert.deepEqual(headingFor('base'), ['Base Data Commons', true]);
    assert.deepEqual(headingFor('un_system'), ['UN System Data Commons', false]);
    assert.deepEqual(headingFor('some_new_origin'), ['Another origin', false]);
    assert.deepEqual(headingFor(null), ['On the graph', false]);
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

test('a share is a whole percentage, at least 1 when anything is used', () => {
    assert.equal(sharePercent(1, 653), 1);
    assert.equal(sharePercent(0, 653), 0);
    assert.equal(sharePercent(5, 0), 0);
    assert.equal(sharePercent(14, 25), 56);
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
