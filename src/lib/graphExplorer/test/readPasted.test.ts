/**
 * `readPasted`: how a seed or StatVar output is read, pinned on four seeds
 * from the pipelines repository.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import {
    mapHeaders,
    parsePasted,
    readPasted,
    switchColumn,
    type ColumnSwitch,
    type ReadSummary,
    type SkipReason,
} from '../pasted.ts';
import { readSchema, readUsage } from '../wire.ts';
import { baseUsageBody, schemaBody, unUsageBody, usageBody } from './fixtures.ts';
import { seedColumns, seedCsv, seedRows } from '../seed.ts';
import { seedFixture, type SeedName } from './seedFixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));
const full = buildModel(
    readSchema(schemaBody()),
    readUsage(usageBody()),
    readUsage(baseUsageBody()),
    readUsage(unUsageBody()),
);

const headers = (columns: ReadSummary['checked']): string[] => columns.map(({ header }) => header);
const skips = (summary: ReadSummary): Record<string, SkipReason> =>
    Object.fromEntries(summary.skipped.map(({ header, reason }) => [header, reason]));

type Expected = {
    rows: number;
    skippedRows: number;
    checked: string[];
    skipped: Record<string, SkipReason>;
};

const EXPECTED: Record<SeedName, Expected> = {
    dac2a: {
        rows: 20,
        skippedRows: 0,
        checked: [
            'population_type',
            'measured_property',
            'stat_type',
            'measurement_qualifier',
            'financial_flow_type',
            'netting_basis',
            'dac_type_of_finance',
            'measurement_denominator',
        ],
        skipped: {
            aid_type: 'no_field',
            measurement_method: 'never_constraint',
            unit: 'never_constraint',
            dac2a_aid_type: 'codes',
        },
    },
    // Rows 1 and 4 reuse a StatVar through statvar_dcid and define none.
    dac1: {
        rows: 20,
        skippedRows: 2,
        checked: [
            'population_type',
            'measured_property',
            'stat_type',
            'measurement_qualifier',
            'financial_flow_type',
            'financial_obligation_type',
            'netting_basis',
            'fixed_capital_consumption_basis',
            'dac_type_of_finance',
        ],
        skipped: {
            aid_type: 'no_field',
            flow: 'no_field',
            statvar_dcid: 'no_field',
            denominator_aid_type: 'no_field',
            dac1_aid_type: 'codes',
            unit: 'never_constraint',
            entity_property: 'never_constraint',
        },
    },
    // cyclical_adjustment has no filled cell and is checked.
    weo: {
        rows: 9,
        skippedRows: 0,
        checked: [
            'population_type',
            'measured_property',
            'stat_type',
            'measurement_qualifier',
            'product_tax_basis',
            'fixed_capital_consumption_basis',
            'cyclical_adjustment',
            'currency_conversion_basis',
            'final_expenditure_type',
        ],
        skipped: {
            concept_code: 'no_field',
            statvar_name: 'never_constraint',
            denominator_concept_code: 'no_field',
            denominator_dcid: 'no_field',
            unit: 'never_constraint',
            measurement_method: 'never_constraint',
        },
    },
    // net_of and fixed_capital_consumption_basis are empty in these rows and are checked.
    ids: {
        rows: 20,
        skippedRows: 0,
        checked: [
            'population_type',
            'measured_property',
            'stat_type',
            'net_of',
            'fixed_capital_consumption_basis',
        ],
        skipped: {
            dataset: 'no_field',
            measure: 'no_field',
            unit: 'never_constraint',
            entity_property: 'never_constraint',
        },
    },
};

for (const [name, expected] of Object.entries(EXPECTED) as [SeedName, Expected][]) {
    test(`${name} reads as a seed with the columns, skips and rows of its summary`, () => {
        // A model over the outside usage documents too reads a DFO seed the same way.
        for (const over of [model, full]) {
            const { summary, sheet } = readPasted(over, seedFixture(name));
            assert.equal(summary.kind, 'seed');
            assert.equal(summary.rows, expected.rows);
            assert.equal(summary.skippedRows, expected.skippedRows);
            assert.equal(sheet.rows.length, expected.rows - expected.skippedRows);
            assert.deepEqual(headers(summary.checked), expected.checked);
            assert.deepEqual(skips(summary), expected.skipped);
        }
    });
}

test('a seed copied from a UN dataset checks the UN property its column names, value and all', () => {
    const eclac = full.dataset('undata/p/ECLAC');
    assert.ok(eclac);
    const columns = seedColumns(eclac);
    const { rows } = seedRows(columns, 'P1\tPensions, women');
    const sexAt = columns.findIndex((column) => column.property === 'sex');
    const filled = rows.map((row) =>
        row.map((cell, at) => (at === sexAt ? 'dcid:SEX-NONE' : cell)),
    );
    const text = seedCsv(columns, filled);

    const { mapping, sheet, summary } = readPasted(full, text);
    assert.deepEqual(mapping[sexAt]?.target, { kind: 'property', property: 'sex' });
    assert.deepEqual(sheet.rows[0]?.constraint_properties, { sex: 'SEX-NONE' });
    assert.equal(skips(summary).sex, undefined);
    // A model over the DFO document alone has no field for it.
    assert.equal(skips(readPasted(model, text).summary).sex, 'no_field');
});

test('rows that reuse a StatVar are skipped and named by sheet row', () => {
    assert.deepEqual(readPasted(model, seedFixture('dac1')).sheet.skipped, [2, 5]);
});

test('a paste with a dcid column is StatVar output and checks every mapped column', () => {
    const { header, rows } = parsePasted(seedFixture('dac2a'));
    const text = [['dcid', ...header], ...rows.map((row) => ['X', ...row])]
        .map((cells) => cells.join(','))
        .join('\n');
    const { summary } = readPasted(model, text);
    assert.equal(summary.kind, 'statvars');
    assert.ok(headers(summary.checked).includes('dac2a_aid_type'));
    assert.ok(headers(summary.checked).includes('dcid'));
    assert.equal(skips(summary).dac2a_aid_type, undefined);
    // A row with a dcid and empty definition cells is sent, so the check reports them.
    const empty = readPasted(model, 'dcid,population_type,measured_property\nX,,\n,,\n');
    assert.deepEqual(empty.sheet.skipped, []);
    assert.deepEqual(empty.sheet.sheetRows, [2]);
    assert.equal(empty.sheet.rows[0]?.measured_property, null);
});

test('a never-constraint header is skipped even when it names a property of the model', () => {
    const { skip } = mapHeaders(model, [
        'unit',
        'name',
        'constraint_properties',
        'netting_basis',
    ])[0]!;
    assert.equal(skip, 'never_constraint');
    const mapping = mapHeaders(model, ['unit', 'name', 'constraint_properties', 'netting_basis']);
    assert.deepEqual(
        mapping.map((column) => column.skip),
        ['never_constraint', 'never_constraint', 'never_constraint', null],
    );
});

test('a column with prefixed and bare cells stays checked, and each bare cell is a finding', () => {
    const text = [
        'population_type,measured_property,stat_type,netting_basis',
        'dcid:FinancialFlow,dcid:amount,dcid:measuredValue,dcid:Gross',
        'dcid:FinancialFlow,dcid:amount,dcid:measuredValue,Net',
        'dcid:FinancialFlow,dcid:amount,dcid:measuredValue,',
        // A row the check skips raises no finding.
        ',,,Net',
    ].join('\n');
    const read = readPasted(model, text);
    assert.deepEqual(read.prefixFindings, [
        { code: 'missing_prefix', column: 3, header: 'netting_basis', row: 3, value: 'Net' },
    ]);
    assert.ok(headers(read.summary.checked).includes('netting_basis'));
    // The bare cell is sent to the check.
    assert.equal(read.sheet.rows[1]?.constraint_properties?.nettingBasis, 'Net');
});

test('a reader switch overrides a default skip, and the skipped property keeps its name', () => {
    const text = seedFixture('dac2a');
    const base = readPasted(model, text);
    const index = base.mapping.find(({ header }) => header === 'dac2a_aid_type')!.index;
    const switches = new Map<number, ColumnSwitch>([
        [index, { header: 'dac2a_aid_type', to: 'property' }],
    ]);
    const read = readPasted(model, text, switches);
    assert.ok(headers(read.summary.checked).includes('dac2a_aid_type'));
    assert.equal(read.sheet.rows[0]?.constraint_properties?.dac2aAidType, '106');
    const off = switchColumn(read.mapping, index, 'ignored');
    assert.equal(off[index]?.skip, 'switched');
});

test('a comma-separated file and the same range pasted from a spreadsheet read alike', () => {
    const csv = seedFixture('weo');
    const { header, rows } = parsePasted(csv);
    const tabs = [header, ...rows].map((cells) => cells.join('\t')).join('\n');
    const a = readPasted(model, csv);
    const b = readPasted(model, `﻿${tabs}`);
    assert.deepEqual(b.summary, a.summary);
    assert.deepEqual(b.sheet, a.sheet);
});

test('a codes column is decided from the rows the check sends', () => {
    const text = [
        'source_code,statvar_dcid,population_type,measured_property,stat_type,dac1_aid_type',
        // A row that reuses a StatVar is skipped, so its prefixed cell does not count.
        'A,dcid:X,,,,dcid:DAC1AidType1010',
        'B,,dcid:FinancialFlow,dcid:amount,dcid:measuredValue,1010',
        'C,,dcid:FinancialFlow,dcid:amount,dcid:measuredValue,1015',
    ].join('\n');
    const read = readPasted(model, text);
    assert.deepEqual(read.sheet.skipped, [2]);
    assert.equal(skips(read.summary).dac1_aid_type, 'codes');
    assert.deepEqual(read.sheet.rows[0]?.constraint_properties, {});
    assert.deepEqual(read.prefixFindings, []);
});

test('a column of bare dcids of its value list is checked, and each cell is a finding', () => {
    const text = [
        'population_type,measured_property,stat_type,netting_basis',
        'dcid:FinancialFlow,dcid:amount,dcid:measuredValue,Gross',
        'dcid:FinancialFlow,dcid:amount,dcid:measuredValue,Net',
    ].join('\n');
    const read = readPasted(model, text);
    assert.ok(headers(read.summary.checked).includes('netting_basis'));
    assert.deepEqual(
        read.prefixFindings.map(({ code, row, value }) => [code, row, value]),
        [
            ['missing_prefix', 2, 'Gross'],
            ['missing_prefix', 3, 'Net'],
        ],
    );
});
