/**
 * `tables.ts` over the test documents: a scoped list and a value list as CSV
 * rows. Expected values were read from the fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import {
    patternFileName,
    patternTable,
    scopedListTable,
    valueListFileName,
    valueListTable,
} from '../tables.ts';
import { readSchema, readUsage, type ProvenanceUsage } from '../wire.ts';
import { baseUsageBody, schemaBody, usageBody } from './fixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
const scope = { kind: 'class', id: 'FinancialObligation' } as const;

test('a scoped list without a dataset filter has the StatVar total', () => {
    const table = scopedListTable(model, model.scopedList(scope, { kind: 'none' }));
    assert.deepEqual(table[0], ['dcid', 'label', 'group', 'value_list', 'stat_vars']);
    assert.deepEqual(table[1], ['amount', 'amount', 'measured', '', '515']);
    assert.equal(table.length, 1 + model.scopedList(scope, { kind: 'none' }).total);
});

test('with every dataset on, each dataset has a count column headed by its label, most StatVars first', () => {
    const table = scopedListTable(model, model.scopedList(scope, { kind: 'all' }));
    assert.deepEqual(table[0], [
        'dcid',
        'label',
        'group',
        'value_list',
        'OECD DAC1',
        'OECD DAC2a',
        'ONE Data Climate Finance',
        'OECD DAC2b',
    ]);
    assert.deepEqual(table[1], ['amount', 'amount', 'measured', '', '468', '24', '9', '14']);
});

test("columns that share a label carry each dataset's origin", () => {
    const base = readUsage(baseUsageBody());
    const [births] = base.provenances;
    assert.ok(births);
    const renamed: ProvenanceUsage = { ...births, label: 'OECD DAC1' };
    const named = { ...base, provenances: [renamed] };
    const both = buildModel(readSchema(schemaBody()), readUsage(usageBody()), named);
    const fromBase = new Set<ProvenanceUsage>([renamed]);
    const table = scopedListTable(both, both.scopedList({ kind: 'dfo' }, { kind: 'all' }), {
        origin: (dataset) => (fromBase.has(dataset) ? 'base' : null),
    });
    const heads = table[0]?.slice(4) ?? [];
    assert.ok(heads.includes('OECD DAC1 (DFO)'));
    assert.ok(heads.includes('OECD DAC1 (base Data Commons)'));
    assert.ok(heads.includes('OECD DAC2a'));

    // Two DFO datasets sharing a label within one origin also carry their dcids.
    const dfo = readUsage(usageBody());
    const twins = {
        ...dfo,
        provenances: dfo.provenances.map((dataset) =>
            dataset.ref === 'provenance/OECDDAC2A' ? { ...dataset, label: 'OECD DAC1' } : dataset,
        ),
    };
    const three = buildModel(readSchema(schemaBody()), twins, named);
    const twinHeads =
        scopedListTable(three, three.scopedList({ kind: 'dfo' }, { kind: 'all' }), {
            origin: (dataset) => (fromBase.has(dataset) ? 'base' : null),
        })[0]?.slice(4) ?? [];
    assert.ok(twinHeads.includes('OECD DAC1 (DFO, provenance/OECDDAC1)'));
    assert.ok(twinHeads.includes('OECD DAC1 (DFO, provenance/OECDDAC2A)'));
    assert.ok(twinHeads.includes('OECD DAC1 (base Data Commons)'));
    assert.equal(new Set(twinHeads).size, twinHeads.length);
});

test('only the rows the filter text keeps are written, matched on label or dcid', () => {
    const list = model.scopedList(scope, { kind: 'none' });
    const table = scopedListTable(model, list, { filter: '  DAC ' });
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

test('a value list whose members have no code has no code column, and a column per open property', () => {
    const table = valueListTable(model, 'FinancialPositionTypeEnum');
    assert.deepEqual(table[0], ['dcid', 'label', 'broader', 'wbCode']);
    assert.deepEqual(table[1], ['AmountOutstanding', 'amount outstanding', '', 'DOD']);
});

test("a value list's open property column writes a held node reference as its label", () => {
    const table = valueListTable(model, 'CurrencyDenomination');
    const status = table[0]?.indexOf('currencyStatus') ?? -1;
    const chf = table.find((row) => row[0] === 'CurrencyCHF');
    assert.equal(chf?.[status], 'current');
});

for (const [listId, fileName] of [
    ['NettingBasisEnum', 'netting-basis.csv'],
    ['DAC1AidTypeEnum', 'dac-1-aid-type-partial.csv'],
] as const) {
    test(`the CSV file of ${listId} is ${fileName}`, () => {
        assert.equal(valueListFileName(model, listId), fileName);
    });
}

test("a dataset's patterns are written group by group, one row per pattern", () => {
    const [head, ...rows] = patternTable(model, 'provenance/OECDDAC2A');
    assert.deepEqual(head?.slice(0, 3), ['split_combination', 'split', 'population_type']);
    assert.equal(rows.length, 6);
    const column = (name: string) => head?.indexOf(name) ?? -1;
    assert.deepEqual(
        rows.map((row) => row[column('split_combination')]),
        ['1', '2', '2', '2', '2', '3'],
    );
    assert.deepEqual(
        rows
            .filter((row) => row[column('split_combination')] === '2')
            .map((row) => row[column('measurement_denominator')])
            .toSorted(),
        [
            '',
            '',
            'Count_Person',
            'PrimaryIncome_EconomicUnit_GrossOfFixedCapitalConsumption_Nominal',
        ],
    );
    assert.deepEqual(
        [
            ...new Set(
                rows.map((row) => `${row[column('split_combination')]} ${row[column('split')]}`),
            ),
        ],
        [
            '1 dac2aAidType; dacTypeOfFinance; financialFlowType; nettingBasis',
            '2 dac2aAidType; financialFlowType; nettingBasis',
            '3 dac2aAidType; financialFlowType',
        ],
    );
    assert.deepEqual(
        [...new Set(rows.map((row) => row[column('measurement_denominator_unresolved')]))],
        ['false'],
    );
    assert.equal(patternFileName(model, 'provenance/OECDDAC2A'), 'oecd-dac2a-patterns.csv');
});
