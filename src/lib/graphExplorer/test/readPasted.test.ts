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
    readSummaryText,
    switchColumn,
    type ColumnSwitch,
    type ReadSummary,
    type SkipReason,
} from '../pasted.ts';
import { readSchema, readUsage } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';
import { seedCsv, type SeedName } from './seedFixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));

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
        const { summary, sheet } = readPasted(model, seedCsv(name));
        assert.equal(summary.kind, 'seed');
        assert.equal(summary.rows, expected.rows);
        assert.equal(summary.skippedRows, expected.skippedRows);
        assert.equal(sheet.rows.length, expected.rows - expected.skippedRows);
        assert.deepEqual(headers(summary.checked), expected.checked);
        assert.deepEqual(skips(summary), expected.skipped);
    });
}

test('rows that reuse a StatVar are skipped and named by sheet row', () => {
    assert.deepEqual(readPasted(model, seedCsv('dac1')).sheet.skipped, [2, 5]);
});

test('a paste with a dcid column is StatVar output and checks every mapped column', () => {
    const { header, rows } = parsePasted(seedCsv('dac2a'));
    const text = [['dcid', ...header], ...rows.map((row) => ['X', ...row])]
        .map((cells) => cells.join(','))
        .join('\n');
    const { summary } = readPasted(model, text);
    assert.equal(summary.kind, 'statvars');
    assert.ok(headers(summary.checked).includes('dac2a_aid_type'));
    assert.ok(headers(summary.checked).includes('dcid'));
    assert.equal(skips(summary).dac2a_aid_type, undefined);
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
    // The bare cell is still sent.
    assert.equal(read.sheet.rows[1]?.constraint_properties?.nettingBasis, 'Net');
});

test('a reader switch overrides a default skip, and the skipped property keeps its name', () => {
    const text = seedCsv('dac2a');
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
    const csv = seedCsv('weo');
    const { header, rows } = parsePasted(csv);
    const tabs = [header, ...rows].map((cells) => cells.join('\t')).join('\n');
    const a = readPasted(model, csv);
    const b = readPasted(model, `﻿${tabs}`);
    assert.deepEqual(b.summary, a.summary);
    assert.deepEqual(b.sheet, a.sheet);
});

test('the summary line words each skip reason for one column or several', () => {
    const text = readSummaryText(readPasted(model, seedCsv('dac2a')).summary);
    assert.match(text, /aid_type \(the check has no field for it\)/);
    assert.match(text, /measurement_method and unit \(never constraints\)/);
});
