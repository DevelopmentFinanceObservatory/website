/**
 * `newSheet.ts` over the test documents: the page's URL state in both entry
 * forms, and the defaults the model fills. Expected values were read from
 * the fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { NO_CARRIED, readCarried } from '../explore.ts';
import {
    queryOf,
    readSheetQuery,
    resolveSheet,
    sheetHref,
    sheetQuery,
    splitOptions,
} from '../newSheet.ts';
import { readSchema, readUsage } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';
import { withPatternClass } from './sheetFixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
const read = (query: string) => readSheetQuery(new URLSearchParams(query));
const resolve = (query: string) => {
    const selection = resolveSheet(model, read(query));
    assert.ok(selection);
    return selection;
};

test('the two entry forms read as a class or a dataset pattern', () => {
    assert.deepEqual(read('class=FinancialFlow'), {
        classId: 'FinancialFlow',
        measured: null,
        split: null,
        from: null,
    });
    assert.deepEqual(read('dataset=provenance%2FOECDDAC1&pattern=3'), {
        classId: null,
        measured: null,
        split: null,
        from: { dataset: 'provenance/OECDDAC1', index: 3 },
    });
    // A pattern index that is not a whole number names no pattern.
    assert.equal(read('dataset=provenance/OECDDAC1&pattern=x').from, null);
    assert.equal(read('dataset=provenance/OECDDAC1').from, null);
});

test('split reads in order without repeats; an empty split ticks none, a missing one takes the default', () => {
    assert.deepEqual(read('split=b,a,,b').split, ['b', 'a']);
    assert.deepEqual(read('split=').split, []);
    assert.equal(read('class=X').split, null);
});

test('a written query reads back as the same state', () => {
    const states = [
        { classId: null, measured: null, split: null, from: null },
        {
            classId: 'FinancialFlow',
            measured: 'amount',
            split: ['nettingBasis', 'dac1AidType'],
            from: { dataset: 'provenance/OECDDAC1', index: 0 },
        },
        { classId: 'FinancialFlow', measured: null, split: [], from: null },
    ];
    for (const state of states) assert.deepEqual(read(sheetQuery(state, NO_CARRIED)), state);
    assert.equal(sheetQuery(states[0]!, NO_CARRIED), '');
    assert.equal(
        sheetQuery(
            { classId: 'FinancialFlow', measured: null, split: ['a', 'b'], from: null },
            NO_CARRIED,
        ),
        '?class=FinancialFlow&split=a%2Cb',
    );
});

test('a sheet link keeps the carried dataset filter and base switch', () => {
    const carried = { show: { kind: 'all' }, base: true } as const;
    const href = sheetHref({ from: { dataset: 'provenance/OECDDAC1', index: 2 } }, carried);
    const params = new URL(href, 'https://x.invalid').searchParams;
    assert.equal(new URL(href, 'https://x.invalid').pathname, '/graph-explorer/new-sheet');
    assert.deepEqual(readCarried(params), carried);
    assert.deepEqual(readSheetQuery(params).from, { dataset: 'provenance/OECDDAC1', index: 2 });
    assert.equal(
        sheetHref({ classId: 'FinancialFlow' }, NO_CARRIED),
        '/graph-explorer/new-sheet?class=FinancialFlow',
    );
});

test('a class takes its most-used pattern: measured property, ticks and definition fields', () => {
    const flow = resolve('class=FinancialFlow');
    assert.equal(flow.measured, 'amount');
    assert.deepEqual(flow.properties, ['dac1AidType', 'financialFlowType', 'nettingBasis']);
    assert.deepEqual([flow.template?.dataset, flow.template?.index], ['provenance/OECDDAC1', 0]);
    assert.equal(flow.templateNamed, false);
    assert.equal(flow.spec.statType, 'measuredValue');
    assert.equal(flow.spec.qualifier, 'Nominal');
    assert.deepEqual(flow.measuredOptions, ['amount', 'grantEquivalent', 'attributedAmount']);

    const obligation = resolve('class=FinancialObligation');
    assert.deepEqual(obligation.properties, [
        'dac1AidType',
        'dacTypeOfFinance',
        'financialObligationType',
    ]);
});

test('nothing set takes the kind of thing the most datasets use', () => {
    assert.equal(resolve('').classId, 'FinancialFlow');
    assert.equal(resolve('class=NotAClass').classId, 'FinancialFlow');
});

test('a dataset pattern sets the class, measured property and ticks in its own order', () => {
    const selection = resolve('dataset=provenance/OECDDAC1&pattern=3');
    assert.equal(selection.classId, 'FinancialFlow');
    assert.equal(selection.measured, 'grantEquivalent');
    assert.deepEqual(selection.properties, ['dac1AidType', 'financialFlowType']);
    assert.equal(selection.templateNamed, true);
    assert.deepEqual(read(sheetQuery(queryOf(selection), NO_CARRIED)).from, {
        dataset: 'provenance/OECDDAC1',
        index: 3,
    });
});

test('another measured property drops the named pattern for the most-used one with it', () => {
    const selection = resolve('dataset=provenance/OECDDAC1&pattern=3&measured=amount');
    assert.equal(selection.templateNamed, false);
    assert.deepEqual(
        [selection.template?.dataset, selection.template?.index],
        ['provenance/OECDDAC1', 0],
    );
    assert.equal(queryOf(selection).from, null);
});

test('ticks keep their order and drop what the class does not offer', () => {
    const selection = resolve('class=FinancialFlow&split=nettingBasis,notAProperty,crsPurpose');
    assert.deepEqual(selection.properties, ['nettingBasis', 'crsPurpose']);
    assert.deepEqual(resolve('class=FinancialFlow&split=').properties, []);
});

test('the URL ids the model does not offer are named, in URL order; known ones are not', () => {
    assert.deepEqual(
        resolve('class=NotAClass&measured=notMeasured&split=nettingBasis,notAProperty').unknown,
        [
            { param: 'class', id: 'NotAClass' },
            { param: 'measured', id: 'notMeasured' },
            { param: 'split', id: 'notAProperty' },
        ],
    );
    assert.deepEqual(resolve('dataset=provenance/Gone&pattern=0').unknown, [
        { param: 'pattern', id: 'provenance/Gone', index: 0 },
    ]);
    assert.deepEqual(resolve('dataset=provenance/OECDDAC2B&pattern=99').unknown, [
        { param: 'pattern', id: 'provenance/OECDDAC2B', index: 99 },
    ]);
    assert.deepEqual(resolve('dataset=provenance/OECDDAC2B&pattern=0').unknown, []);
    assert.deepEqual(resolve('class=FinancialFlow&measured=amount&split=nettingBasis').unknown, []);
    assert.deepEqual(resolve('').unknown, []);
});

test('split options: in use first, then unused ones declared for the class with a value list', () => {
    const options = splitOptions(model, 'FinancialFlow');
    const used = options.filter((option) => option.inUse).map((option) => option.id);
    assert.deepEqual(used, [
        'dac1AidType',
        'financialFlowType',
        'nettingBasis',
        'dacTypeOfFinance',
        'dac2aAidType',
        'climatePolicyObjective',
        'dac2bAidType',
    ]);
    assert.equal(
        options.findIndex((option) => !option.inUse),
        used.length,
    );
    const ids = options.map((option) => option.id);
    // Measured, between and value-list-less properties are not offered.
    for (const id of ['amount', 'financingProvider', 'amountMobilised', 'wbCode']) {
        assert.ok(!ids.includes(id), id);
    }
    const netting = options.find((option) => option.id === 'nettingBasis');
    assert.deepEqual(netting?.valueLists, ['NettingBasisEnum']);
    assert.equal(netting?.members, 2);
    assert.equal(netting?.datasets[0], 'provenance/OECDDAC1');
});

test('a property ranging over a class with instances is offered with its value list', () => {
    const currency = splitOptions(model, 'FinancialPosition').find(
        (option) => option.id === 'currencyOfDenomination',
    );
    assert.deepEqual(currency?.valueLists, ['CurrencyDenomination']);
    assert.equal(currency?.members, 2);
    assert.equal(currency?.membersComplete, true);
});

test('a named pattern about no kind of thing is named as unknown and the default class used', () => {
    const classless = withPatternClass('provenance/OECDDAC2A', 3, null);
    const selection = resolveSheet(classless, read('dataset=provenance/OECDDAC2A&pattern=3'));
    assert.equal(selection?.classId, 'FinancialFlow');
    assert.equal(selection?.templateNamed, false);
    assert.deepEqual(selection?.unknown, [
        { param: 'pattern', id: 'provenance/OECDDAC2A', index: 3 },
    ]);
});

test('a measured property offered through a narrower class finds its template there', () => {
    // FinancialFlow and FinancialObligation are narrower than FinancingEvent.
    const broad = withPatternClass('provenance/ONEClimateFinance', 0, 'FinancingEvent');
    const selection = resolveSheet(broad, read('class=FinancingEvent&measured=grantEquivalent'));
    assert.ok(selection);
    assert.ok(selection.measuredOptions.includes('grantEquivalent'));
    assert.equal(selection.measured, 'grantEquivalent');
    assert.deepEqual(
        [selection.template?.dataset, selection.template?.index],
        ['provenance/OECDDAC1', 3],
    );
    assert.equal(selection.spec.statType, selection.template?.pattern.stat_type);
});
