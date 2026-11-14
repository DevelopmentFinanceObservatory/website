/**
 * `tables.ts` over the test documents: a scoped list and a value list as CSV
 * rows. Expected values were read from the fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { scopedListTable, valueListFileName, valueListTable } from '../tables.ts';
import { readSchema, readUsage } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
const scope = { kind: 'class', id: 'FinancialObligation' } as const;

test('a scoped list without a dataset filter has the StatVar total', () => {
    const table = scopedListTable(model, model.scopedList(scope, { kind: 'none' }));
    assert.deepEqual(table[0], ['dcid', 'label', 'group', 'value_list', 'stat_vars']);
    assert.deepEqual(table[1], ['amount', 'amount', 'measured', '', '515']);
    assert.equal(table.length, 1 + model.scopedList(scope, { kind: 'none' }).total);
});

test('with every dataset on, each dataset has a count column headed by its label', () => {
    const table = scopedListTable(model, model.scopedList(scope, { kind: 'all' }));
    assert.deepEqual(table[0], [
        'dcid',
        'label',
        'group',
        'value_list',
        'OECD DAC1',
        'OECD DAC2a',
        'OECD DAC2b',
        'ONE Data Climate Finance',
    ]);
    assert.deepEqual(table[1], ['amount', 'amount', 'measured', '', '468', '24', '14', '9']);
});

test('only the rows the filter text keeps are written, matched on label or dcid', () => {
    const list = model.scopedList(scope, { kind: 'none' });
    const table = scopedListTable(model, list, '  DAC ');
    assert.deepEqual(
        table.slice(1).map((row) => [row[0], row[2], row[3]]),
        [
            ['dac1AidType', 'split', 'DAC1AidTypeEnum'],
            ['dacTypeOfFinance', 'split', 'DACTypeOfFinanceEnum'],
            ['dac2aAidType', 'unused', 'DAC2aAidTypeEnum'],
            ['dac2bAidType', 'unused', 'DAC2bAidTypeEnum'],
            ['dacPart', 'unused', 'DACPartEnum'],
        ],
    );
});

test('a value list has each member with its code and broader members of the list', () => {
    const table = valueListTable(model, 'DAC1AidTypeEnum');
    assert.deepEqual(table[0], ['dcid', 'label', 'code', 'broader']);
    assert.equal(table.length, 18);
    assert.deepEqual(table[1], [
        'DAC1AidType5',
        'official and private flow (DAC 1 aid type)',
        '5',
        '',
    ]);
    assert.deepEqual(table[2], [
        'DAC1AidType200',
        'other official flow (DAC 1 aid type)',
        '200',
        'DAC1AidType5',
    ]);
});

for (const [listId, fileName] of [
    ['NettingBasisEnum', 'netting-basis.csv'],
    ['DAC1AidTypeEnum', 'dac-1-aid-type-partial.csv'],
] as const) {
    test(`the CSV file of ${listId} is ${fileName}`, () => {
        assert.equal(valueListFileName(model, listId), fileName);
    });
}
