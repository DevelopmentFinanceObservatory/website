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
    nodeBoxes,
    openEntries,
    outsideKind,
    periodText,
    pictureLens,
    sharePercent,
    type FocusBox,
} from '../focus.ts';
import { buildModel } from '../model.ts';
import { readSchema, readUsage, readTerms } from '../wire.ts';
import { schemaBody, usageBody, termsBody } from './fixtures.ts';

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
            .map((node) => String(node.dcid))
            .find((id) => base.kind(id) === kind && base.usage(id).total === 0);
    const unusedClass = unused('class');
    const unusedProperty = unused('property');
    assert.ok(unusedClass && unusedProperty);

    const provider = body.nodes.find((node) => node.dcid === 'financingProvider');
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
        [base?.base, base?.term?.dcid, base?.sub],
        [true, outside, { kind: 'dcid', id: outside }],
    );
    assert.notEqual(outsideKind(base?.term), outsideKind(undefined));

    // Without the terms list the same id reads as outside the model, with no term.
    const unknown = centreHeading(model, { kind: 'node', id: outside });
    assert.deepEqual([unknown?.base, unknown?.term, unknown?.name], [false, undefined, outside]);
    assert.notEqual(unknown?.kind, base?.kind);
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
            values: [{ kind: 'node', id: 'CurrencyStatusCurrent' }],
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
