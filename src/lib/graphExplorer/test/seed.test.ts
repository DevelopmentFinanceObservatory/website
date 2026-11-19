/**
 * `seed.ts` over datasets shaped like three production datasets: OECD DAC2A,
 * OECD Climate-related Development Finance and ONE Data Climate Finance.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { NO_CARRIED, readCarried, type Carried } from '../explore.ts';
import {
    activeConstraints,
    columnName,
    NEW_SEED_NAME,
    readSeedQuery,
    seedColumns,
    seedCsv,
    seedQuery,
    seedHref,
    seedRows,
    seedsYml,
    formulaRows,
    type SeedDataset,
} from '../seed.ts';
import { readUsage, type SchemaConstraintValues, type SchemaPattern } from '../wire.ts';
import { usageBody } from './fixtures.ts';

const pattern = (fields: Partial<SchemaPattern>): SchemaPattern => ({
    population_type: 'FinancialFlow',
    measured_property: 'amount',
    stat_type: 'measuredValue',
    measurement_qualifier: null,
    measurement_denominator: null,
    constraint_properties: [],
    observation_properties: [],
    stat_var_count: 1,
    examples: [],
    ...fields,
});

/** A constraint's values as the usage document lists them, each held by one StatVar. */
const values = (property: string, ...ids: string[]): SchemaConstraintValues => ({
    property,
    values: ids.map((value) => ({ value, stat_var_count: 1 })),
});

/** A constraint's one value, held by `count` StatVars. */
const counted = (property: string, value: string, count: number): SchemaConstraintValues => ({
    property,
    values: [{ value, stat_var_count: count }],
});

const DAC2A_CONSTRAINTS = ['dac2aAidType', 'dacTypeOfFinance', 'financialFlowType', 'nettingBasis'];

const dac2a: SeedDataset = {
    id: 'provenance/OECDDAC2A',
    label: 'OECD DAC2a',
    stat_var_count: 2,
    patterns: [
        pattern({ measured_property: 'amount', constraint_properties: DAC2A_CONSTRAINTS }),
        pattern({
            measured_property: 'attributedAmount',
            constraint_properties: DAC2A_CONSTRAINTS,
        }),
    ],
    constraint_values: [
        values('dac2aAidType', 'DAC2aAidType106', 'DAC2aAidType201'),
        counted('financialFlowType', 'Disbursement', 2),
        values('nettingBasis', 'Gross', 'Net'),
    ],
};

const crdf: SeedDataset = {
    id: 'provenance/OECDClimateRelatedDevelopmentFinance',
    label: 'OECD Climate-related Development Finance',
    stat_var_count: 1,
    patterns: [
        pattern({
            population_type: 'FinancialObligation',
            constraint_properties: ['climatePolicyObjective', 'financialObligationType'],
        }),
    ],
    constraint_values: [values('financialObligationType', 'Commitment')],
};

const oneClimate: SeedDataset = {
    id: 'provenance/ONEClimateFinance',
    label: 'ONE Data Climate Finance',
    stat_var_count: 3,
    patterns: [
        pattern({ constraint_properties: ['financialFlowType', 'climateFinanceType'] }),
        pattern({
            measured_property: 'attributedAmount',
            constraint_properties: ['financialFlowType', 'climateFinanceType'],
        }),
        pattern({
            population_type: 'FinancialObligation',
            constraint_properties: ['financialObligationType', 'climateFinanceType'],
        }),
    ],
    // One flow type, but the obligation pattern carries no flow type.
    constraint_values: [values('financialFlowType', 'Disbursement')],
};

const fills = (dataset: SeedDataset) =>
    Object.fromEntries(seedColumns(dataset).map((column) => [column.name, column.fill]));

test('a column is pre-filled only when every pattern gives it one value', () => {
    assert.deepEqual(fills(dac2a), {
        source_code: '',
        statvar_name: '',
        population_type: 'dcid:FinancialFlow',
        measured_property: '',
        stat_type: 'dcid:measuredValue',
        measurement_qualifier: '',
        dac2a_aid_type: '',
        dac_type_of_finance: '',
        financial_flow_type: 'dcid:Disbursement',
        netting_basis: '',
        unit: '',
        measurement_method: '',
        measurement_denominator: '',
    });
    assert.equal(fills(crdf).population_type, 'dcid:FinancialObligation');
    assert.equal(fills(crdf).measured_property, 'dcid:amount');
    // A pattern that leaves the field null breaks the agreement.
    const mixed = { ...crdf, patterns: [...crdf.patterns, pattern({ stat_type: null })] };
    assert.equal(fills(mixed).stat_type, '');
    assert.equal(fills(oneClimate).population_type, '');
    assert.equal(fills(oneClimate).stat_type, 'dcid:measuredValue');
    // A constraint: one value on every pattern, else empty.
    assert.equal(fills(crdf).financial_obligation_type, 'dcid:Commitment');
    assert.equal(fills(crdf).climate_policy_objective, '');
    assert.equal(fills(oneClimate).financial_flow_type, '');
    // One value held by one of the two StatVars leaves the other's unknown.
    const partial = {
        ...dac2a,
        constraint_values: [counted('financialFlowType', 'Disbursement', 1)],
    };
    assert.equal(fills(partial).financial_flow_type, '');
    // An added column is on no pattern of the dataset.
    const added = seedColumns(crdf, { dropped: [], added: ['financialFlowType'] });
    assert.equal(added.find((column) => column.property === 'financialFlowType')?.fill, '');
});

test('a dataset whose patterns cover part of its StatVars pre-fills nothing', () => {
    const usage = readUsage(usageBody()).provenances.find(
        ({ ref }) => ref === 'provenance/OECDDAC1',
    )!;
    // The usage document lists patterns for 554 of DAC1's 653 StatVars.
    const dac1: SeedDataset = { ...usage, id: usage.ref, label: 'OECD DAC1' };
    assert.deepEqual(
        seedColumns(dac1).filter((column) => column.fill !== ''),
        [],
    );
    // With the patterns covering every StatVar, the shared fields fill.
    const covered = fills({ ...dac1, stat_var_count: 554 });
    assert.equal(covered.stat_type, 'dcid:measuredValue');
    assert.equal(covered.measurement_qualifier, 'dcid:Nominal');
    // A one-value constraint fills only when its count is the dataset's.
    assert.equal(fills({ ...dac2a, stat_var_count: 3 }).financial_flow_type, '');
});

test('the columns follow the minimal layout, with the constraints as a union in first-named order', () => {
    assert.deepEqual(
        seedColumns(oneClimate).map((column) => column.name),
        [
            'source_code',
            'statvar_name',
            'population_type',
            'measured_property',
            'stat_type',
            'measurement_qualifier',
            'financial_flow_type',
            'climate_finance_type',
            'financial_obligation_type',
            'unit',
            'measurement_method',
            'measurement_denominator',
        ],
    );
    assert.equal(columnName('dac2aAidType'), 'dac2a_aid_type');
    assert.equal(columnName('dacTypeOfFinance'), 'dac_type_of_finance');
    assert.equal(columnName('includesIMFCredit'), 'includes_imf_credit');
});

test('dropping and adding constraint columns changes the columns and the constraint list', () => {
    const choice = { dropped: ['nettingBasis', 'notThere'], added: ['climatePolicyObjective'] };
    assert.deepEqual(activeConstraints(dac2a, choice), [
        'dac2aAidType',
        'dacTypeOfFinance',
        'financialFlowType',
        'climatePolicyObjective',
    ]);
    const names = seedColumns(dac2a, choice).map((column) => column.name);
    assert.ok(names.includes('climate_policy_objective'));
    assert.ok(!names.includes('netting_basis'));
    // Adding a column the dataset already has adds nothing.
    assert.deepEqual(activeConstraints(crdf, { dropped: [], added: ['climatePolicyObjective'] }), [
        'climatePolicyObjective',
        'financialObligationType',
    ]);
});

test('pasted codes make one row each, the second tab-separated cell filling statvar_name', () => {
    const columns = seedColumns(dac2a);
    const { rows, merged } = seedRows(
        columns,
        '106\tBilateral, total\tUSD\r\n\n 218 \n=SUM\t"quoted"\n218\tMultilateral\n106\tOther\n',
    );
    assert.equal(rows.length, 3);
    assert.equal(merged, 2);
    assert.deepEqual(rows[0]?.slice(0, 3), ['106', 'Bilateral, total', 'dcid:FinancialFlow']);
    // A repeated code merges into its first row, which takes the first label given.
    assert.deepEqual(rows[1]?.slice(0, 2), ['218', 'Multilateral']);
    assert.deepEqual(rows[2]?.slice(0, 2), ['=SUM', 'quoted']);
    assert.ok(rows.every((row) => row.length === columns.length));
});

test('a multi-line label copied from a spreadsheet stays one row', () => {
    const { rows } = seedRows(seedColumns(dac2a), 'A1\t"Line one\nline ""two"""\r\nA2\tPlain\n');
    assert.deepEqual(
        rows.map((row) => row.slice(0, 2)),
        [
            ['A1', 'Line one\nline "two"'],
            ['A2', 'Plain'],
        ],
    );
});

test('the CSV writes cells verbatim and quotes only what RFC 4180 requires', () => {
    const columns = seedColumns(crdf);
    const csv = seedCsv(columns, seedRows(columns, '-1\tSay "hi", then\n+2\t=x').rows);
    const lines = csv.split('\r\n');
    assert.equal(lines[0], columns.map((column) => column.name).join(','));
    assert.ok(lines[1]?.startsWith('-1,"Say ""hi"", then",dcid:FinancialObligation'));
    assert.ok(lines[2]?.startsWith('+2,=x,'));
    assert.equal(lines.length, 3);
    // The rows whose code or label a spreadsheet would run as a formula.
    assert.deepEqual(formulaRows(seedRows(columns, '-1\tA\nB\t@x\nC\tsafe').rows), [0, 1]);
});

test('the seeds.yml stub types every column as a string and tests source_code alone', () => {
    const columns = seedColumns(dac2a);
    const name = NEW_SEED_NAME;
    const yml = seedsYml(name, columns);
    assert.ok(yml.startsWith(`version: 2\n\nseeds:\n  - name: ${name}\n`));
    const types = yml.match(/^ {8}\w+: string$/gm) ?? [];
    assert.equal(types.length, columns.length);
    const block = (column: string) =>
        yml.split('      - name: ').find((part) => part.startsWith(`${column}\n`)) ?? '';
    assert.match(block('source_code'), /data_tests:\n\s+- unique\n\s+- not_null\n$/);
    // A row that reuses a StatVar leaves the identity columns empty.
    for (const column of [
        'population_type',
        'measured_property',
        'stat_type',
        'statvar_name',
        'financial_flow_type',
        'unit',
        'measurement_qualifier',
    ]) {
        assert.doesNotMatch(block(column), /data_tests/);
    }
    assert.match(block('dac2a_aid_type'), /description: ".*dac2aAidType/);
});

test('the URL state round-trips the dataset, dropped and added columns and the carried parameters', () => {
    const query = {
        dataset: 'provenance/OECDDAC2A',
        dropped: ['nettingBasis', 'dacTypeOfFinance'],
        added: ['climatePolicyObjective'],
    };
    const text = seedQuery(query, NO_CARRIED);
    assert.deepEqual(readSeedQuery(new URLSearchParams(text)), query);
    assert.equal(seedQuery({ dataset: null, dropped: [], added: [] }, NO_CARRIED), '');
    assert.deepEqual(readSeedQuery(new URLSearchParams('?drop=a,a,,b')).dropped, ['a', 'b']);
    assert.equal(readSeedQuery(new URLSearchParams('?dataset=')).dataset, null);
});

test('a seed link keeps the carried dataset filter and base switch', () => {
    const carried: Carried = { ...NO_CARRIED, show: { kind: 'all' }, base: true };
    const url = new URL(
        seedHref({ dataset: 'provenance/OECDDAC2A' }, carried),
        'https://x.invalid',
    );
    assert.equal(url.pathname, '/graph-explorer/seed');
    assert.deepEqual(readCarried(url.searchParams), carried);
    assert.equal(readSeedQuery(url.searchParams).dataset, 'provenance/OECDDAC2A');
});
