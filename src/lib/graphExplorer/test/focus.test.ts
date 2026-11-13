/**
 * `focus.ts` over the test documents: the boxes around each kind of term and
 * around a dataset, and a property's declared domain against its use.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    datasetBoxes,
    declaredDomain,
    definedNotUsed,
    nodeBoxes,
    type FocusBox,
} from '../focus.ts';
import { buildModel } from '../model.ts';
import { readOntology, readProvenances } from '../wire.ts';
import { ontologyBody, provenancesBody } from './fixtures.ts';

const model = buildModel(readOntology(ontologyBody()), readProvenances(provenancesBody()));

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
        truncated: false,
    });
    assert.equal(boxes[0]?.values, null);
});

test('a declared domain shows only where it differs from the classes in use', () => {
    assert.deepEqual(declaredDomain(model, 'climatePolicyObjective'), ['FinancingEvent']);
    assert.equal(declaredDomain(model, 'amount')?.includes('EconomicActivity'), true);
    assert.equal(declaredDomain(model, 'financialFlowType'), null);
    assert.equal(declaredDomain(model, 'NotANode'), null);
});
