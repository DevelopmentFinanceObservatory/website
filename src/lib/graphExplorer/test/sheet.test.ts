/**
 * `sheet.ts` over the test documents: sheet columns with lookups, the
 * closest pattern, and CSV quoting. Expected values were read from the
 * fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { readSheetRequest } from '../googleSheet.ts';
import {
    closestPattern,
    csvFileName,
    draftCsvRows,
    exampleRows,
    sheetColumns,
    sheetDraft,
    sheetRequest,
    toCsv,
} from '../sheet.ts';
import { readOntology, readProvenances } from '../wire.ts';
import { ontologyBody, provenancesBody } from './fixtures.ts';

const model = buildModel(readOntology(ontologyBody()), readProvenances(provenancesBody()));

const spec = {
    classId: 'FinancialFlow',
    measuredProperty: 'amount',
    statType: 'measuredValue',
    qualifier: 'Nominal',
    properties: ['nettingBasis', 'dac1AidType', 'financingProvider'],
};

test('sheet columns run reference, definition, then one per chosen property with its lookup', () => {
    const columns = sheetColumns(model, spec);
    assert.deepEqual(
        columns.map((column) => [column.name, column.kind, column.fill]),
        [
            ['source_code', 'reference', null],
            ['source_label', 'reference', null],
            ['populationType', 'definition', 'FinancialFlow'],
            ['measuredProperty', 'definition', 'amount'],
            ['statType', 'definition', 'measuredValue'],
            ['measurementQualifier', 'definition', 'Nominal'],
            ['nettingBasis', 'property', null],
            ['dac1AidType', 'property', null],
            ['financingProvider', 'property', null],
        ],
    );

    const netting = columns[6]?.lookup;
    assert.equal(netting?.valueList, 'NettingBasisEnum');
    assert.deepEqual(netting?.members, [
        { id: 'Gross', label: 'gross', code: null },
        { id: 'Net', label: 'net', code: null },
    ]);

    const dac1 = columns[7]?.lookup;
    assert.equal(dac1?.valueList, 'DAC1AidTypeEnum');
    assert.equal(dac1?.members.length, 17);
    assert.deepEqual(dac1?.members[0], {
        id: 'DAC1AidType5',
        label: 'official and private flow (DAC 1 aid type)',
        code: '5',
    });

    assert.equal(columns[8]?.lookup, null);
});

test('the closest pattern shares the most properties; a tie goes to the larger StatVar count', () => {
    // Four patterns share both properties; the largest holds 209 StatVars.
    const tied = closestPattern(model, 'FinancialFlow', ['financialFlowType', 'nettingBasis']);
    assert.equal(tied?.dataset, 'provenance/OECDDAC1');
    assert.equal(tied?.shared, 2);
    assert.equal(tied?.pattern.stat_var_count, 209);

    // More shared properties beat a larger count.
    const more = closestPattern(model, 'FinancialFlow', ['dac2aAidType', 'nettingBasis']);
    assert.equal(more?.dataset, 'provenance/OECDDAC2A');
    assert.equal(more?.pattern.stat_var_count, 12);

    const single = closestPattern(model, 'FinancialFlow', ['climatePolicyObjective']);
    assert.equal(single?.dataset, 'provenance/ONEClimateFinance');
});

test('no closest pattern when none shares a property or the class has none', () => {
    assert.equal(closestPattern(model, 'FinancialFlow', ['notAProperty']), null);
    assert.equal(closestPattern(model, 'FinancialObligation', ['dac2aAidType']), null);
    assert.equal(closestPattern(model, 'FinancialFlow', []), null);
});

test('CSV quotes fields with commas, quotes and line breaks and ends lines with CRLF', () => {
    assert.equal(
        toCsv([
            ['plain', 'a,b', 'say "hi"'],
            ['two\nlines', '', 'x'],
        ]),
        'plain,"a,b","say ""hi"""\r\n"two\nlines",,x',
    );
});

test('CSV writes a cell a spreadsheet would read as a formula as text, with a leading quote', () => {
    assert.equal(
        toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', '\tx', 'a=b', '']]),
        `"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1),'\tx,a=b,`,
    );
    assert.equal(toCsv([['\rx']]), `"'\rx"`);
});

test('example rows fill definition fields and spread property values across each value list', () => {
    const columns = sheetColumns(model, spec);
    const rows = exampleRows(columns);
    assert.equal(rows.length, 3);
    assert.deepEqual(
        rows.map((row) => row.slice(0, 2)),
        [
            ['EX-1', 'Example row 1'],
            ['EX-2', 'Example row 2'],
            ['EX-3', 'Example row 3'],
        ],
    );
    for (const row of rows) {
        assert.deepEqual(row.slice(2, 6), ['FinancialFlow', 'amount', 'measuredValue', 'Nominal']);
    }
    // nettingBasis has two members, DAC1AidTypeEnum 17; financingProvider has no value list.
    assert.deepEqual(
        rows.map((row) => row.slice(6)),
        [
            ['Gross', 'DAC1AidType5', ''],
            ['Gross', 'DAC1AidType1020', ''],
            ['Net', 'DAC1AidType1100', ''],
        ],
    );
});

test('an empty definition field stays empty in the example rows', () => {
    const rows = exampleRows(sheetColumns(model, { ...spec, statType: null, properties: [] }));
    assert.deepEqual(rows[0], ['EX-1', 'Example row 1', 'FinancialFlow', 'amount', '', 'Nominal']);
});

test('a CSV file name is the label in lower case with hyphens', () => {
    assert.equal(csvFileName('Financial flow'), 'financial-flow.csv');
    assert.equal(csvFileName('  DAC 1 aid type (list)  '), 'dac-1-aid-type-list.csv');
    assert.equal(csvFileName('—'), 'sheet.csv');
});

test('the sheet draft names the class, and both exports carry its columns and rows', () => {
    const draft = sheetDraft(model, spec);
    assert.equal(draft.title, model.label('FinancialFlow'));
    assert.equal(draft.fileName, csvFileName(`${draft.title} mapping sheet`));
    assert.equal(draft.generation, model.generation);
    assert.equal(draft.rows.length, 3);

    const csv = draftCsvRows(draft);
    assert.deepEqual(
        csv[0],
        draft.columns.map((column) => column.name),
    );
    assert.deepEqual(csv.slice(1), draft.rows);

    const request = readSheetRequest(sheetRequest(draft));
    assert.ok(request);
    assert.deepEqual(
        request.columns.map((column) => [column.name, column.lookup?.valueList ?? null]),
        draft.columns.map((column) => [column.name, column.lookup?.valueList ?? null]),
    );
    assert.deepEqual(request.rows, draft.rows);
});
