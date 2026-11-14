/**
 * `sheet.ts` over the test documents: sheet columns with lookups, the
 * closest pattern, and CSV quoting. Expected values were read from the
 * fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import { createBodyBytes, LIMITS, readSheetRequest } from '../googleSheet.ts';
import { readSheetQuery, resolveSheet } from '../newSheet.ts';
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
import { readSchema, readUsage } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';
import { withListedParties, withPatternClass } from './sheetFixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));

const spec = {
    classId: 'FinancialFlow',
    measuredProperty: 'amount',
    statType: 'measuredValue',
    qualifier: 'Nominal',
    denominator: null,
    observationProperties: ['financingProvider', 'financingRecipient'],
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
            ['measurementDenominator', 'definition', null],
            ['observationProperties', 'definition', 'financingProvider,financingRecipient'],
            ['nettingBasis', 'property', null],
            ['dac1AidType', 'property', null],
            ['financingProvider', 'property', null],
        ],
    );

    const netting = columns[8]?.lookup;
    assert.deepEqual(netting?.lists, ['NettingBasisEnum']);
    assert.deepEqual(netting?.members, [
        { id: 'Gross', label: 'gross', code: null, values: [] },
        { id: 'Net', label: 'net', code: null, values: [] },
    ]);

    const dac1 = columns[9]?.lookup;
    assert.deepEqual(dac1?.lists, ['DAC1AidTypeEnum']);
    assert.equal(dac1?.members.length, 17);
    assert.deepEqual(dac1?.members[0], {
        id: 'DAC1AidType5',
        label: 'official and private flow (DAC 1 aid type)',
        code: '5',
        values: [],
    });

    assert.equal(columns[10]?.lookup, null);
});

test('a lookup carries a column per open property its members hold, each member a cell', () => {
    const [column] = sheetColumns(model, { ...spec, properties: ['financialPositionType'] }).slice(
        -1,
    );
    assert.deepEqual(column?.lookup?.fields, ['wbCode']);
    assert.deepEqual(
        column?.lookup?.members.find((member) => member.id === 'AmountOutstanding')?.values,
        ['DOD'],
    );
});

test('a property ranging over a class with instances gets a lookup of those instances', () => {
    const [column] = sheetColumns(model, { ...spec, properties: ['currencyOfDenomination'] }).slice(
        -1,
    );
    const lookup = column?.lookup;
    assert.deepEqual(lookup?.lists, ['CurrencyDenomination']);
    const alpha = lookup?.fields.indexOf('iso4217AlphaCode') ?? -1;
    assert.deepEqual(
        lookup?.members.map((member) => [member.id, member.values[alpha]]),
        [
            ['CurrencyEUR', 'EUR'],
            ['CurrencyCHF', 'CHF'],
        ],
    );
    const status = lookup?.fields.indexOf('currencyStatus') ?? -1;
    const chf = lookup?.members.find((member) => member.id === 'CurrencyCHF');
    assert.equal(chf?.values[status], 'current');
});

test('a property ranging over several listed classes offers every member once, marked partial', () => {
    const [column] = sheetColumns(withListedParties(), {
        ...spec,
        properties: ['financingProvider'],
    }).slice(-1);
    assert.deepEqual(column?.lookup?.lists, ['DACUnspecifiedParty', 'Grouping']);
    assert.deepEqual(
        column?.lookup?.members.map((member) => [member.id, member.code]),
        [
            ['DACMembers', 'G2'],
            ['G20', null],
            ['UnspecifiedDonor', null],
        ],
    );
    assert.equal(column?.lookup?.complete, false);
});

test('the sheet request keeps the open property columns that fit the handler bounds', () => {
    const draft = sheetDraft(model, { ...spec, properties: ['financialPositionType'] });
    const fields = Array.from({ length: LIMITS.fields + 2 }, (_, at) => `f${at}`);
    const widened = {
        ...draft,
        columns: draft.columns.map((column) =>
            column.lookup === null
                ? column
                : {
                      ...column,
                      lookup: {
                          ...column.lookup,
                          fields,
                          members: column.lookup.members.map((member) => ({
                              ...member,
                              // f0 holds a cell past the bound, so it is left off.
                              values: fields.map((_, at) =>
                                  at === 0 ? 'x'.repeat(LIMITS.term + 1) : `v${at}`,
                              ),
                          })),
                      },
                  },
        ),
    };
    const lookup = sheetRequest(widened).columns.find((column) => column.lookup)?.lookup;
    assert.deepEqual(lookup?.fields, fields.slice(1, LIMITS.fields + 1));
    assert.deepEqual(
        lookup?.members[0]?.values,
        fields.slice(1, LIMITS.fields + 1).map((_, at) => `v${at + 1}`),
    );
    assert.ok(readSheetRequest(JSON.parse(JSON.stringify(sheetRequest(widened)))));
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
        assert.deepEqual(row.slice(2, 8), [
            'FinancialFlow',
            'amount',
            'measuredValue',
            'Nominal',
            '',
            'financingProvider,financingRecipient',
        ]);
    }
    // nettingBasis has two members, DAC1AidTypeEnum 17; financingProvider has no value list.
    assert.deepEqual(
        rows.map((row) => row.slice(8)),
        [
            ['Gross', 'DAC1AidType5', ''],
            ['Gross', 'DAC1AidType1020', ''],
            ['Net', 'DAC1AidType1100', ''],
        ],
    );
});

test('an empty definition field stays empty in the example rows', () => {
    const rows = exampleRows(
        sheetColumns(model, { ...spec, statType: null, observationProperties: [], properties: [] }),
    );
    assert.deepEqual(rows[0], [
        'EX-1',
        'Example row 1',
        'FinancialFlow',
        'amount',
        '',
        'Nominal',
        '',
        '',
    ]);
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
        request.columns.map((column) => [
            column.name,
            column.lookup?.members.map((member) => member.id) ?? null,
            column.lookup?.complete ?? null,
        ]),
        draft.columns.map((column) => [
            column.name,
            column.lookup?.members.map((member) => member.id) ?? null,
            column.lookup?.complete ?? null,
        ]),
    );
    assert.deepEqual(request.rows, draft.rows);
});

/** The draft the Start a sheet page makes for a query. */
const draftFor = (query: string) => {
    const selection = resolveSheet(model, readSheetQuery(new URLSearchParams(query)));
    assert.ok(selection);
    return sheetDraft(model, { ...selection.spec, classId: selection.classId });
};

for (const [query, field, value] of [
    // The default template, DAC1 pattern 0, gives financingProvider an observation role.
    ['', 'observationProperties', 'financingProvider'],
    ['dataset=provenance/OECDDAC2A&pattern=3', 'measurementDenominator', 'Count_Person'],
    [
        'dataset=provenance/OECDDAC2A&pattern=3',
        'observationProperties',
        'financingProvider,financingRecipient',
    ],
] as const) {
    test(`both exports of "${query}" carry ${field} ${value}`, () => {
        const draft = draftFor(query);
        const [header = [], ...rows] = draftCsvRows(draft);
        const at = header.indexOf(field);
        assert.ok(at >= 0, field);
        assert.deepEqual(
            rows.map((row) => row[at]),
            [value, value, value],
        );
        const request = readSheetRequest(sheetRequest(draft));
        assert.ok(request);
        assert.equal(request.columns[at]?.name, field);
        assert.deepEqual(
            request.rows.map((row) => row[at]),
            [value, value, value],
        );
    });
}

/** A draft whose one property column lists `count` members, each label and code `textLength` long. */
const draftWithList = (count: number, textLength: number) => {
    const draft = sheetDraft(model, { ...spec, properties: ['nettingBasis'] });
    const text = 'x'.repeat(textLength);
    return {
        ...draft,
        columns: draft.columns.map((column) =>
            column.lookup === null
                ? column
                : {
                      ...column,
                      lookup: {
                          ...column.lookup,
                          members: Array.from({ length: count }, (_, at) => ({
                              id: `M${at}`,
                              label: text,
                              code: text,
                              values: [],
                          })),
                      },
                  },
        ),
    };
};

test('a value list over the member cap is cut to it and marked partial, so the handler takes it', () => {
    const request = sheetRequest(draftWithList(LIMITS.members + 1, 1));
    const lookup = request.columns.find((column) => column.lookup !== null)?.lookup;
    assert.equal(lookup?.members.length, LIMITS.members);
    assert.equal(lookup?.complete, false);
    assert.ok(readSheetRequest(JSON.parse(JSON.stringify(request))));
});

test('a body over the byte caps halves its longest list until both fit', () => {
    const request = sheetRequest(draftWithList(LIMITS.members, LIMITS.term));
    const bytes = new TextEncoder().encode(JSON.stringify(request)).length;
    assert.ok(bytes <= LIMITS.bodyBytes, String(bytes));
    assert.ok(createBodyBytes(request) <= LIMITS.createBytes, String(createBodyBytes(request)));
    // 2,500 members of 500-character labels and codes still make a create body past 2 MB.
    const lookup = request.columns.find((column) => column.lookup !== null)?.lookup;
    assert.equal(lookup?.members.length, LIMITS.members / 4);
    assert.equal(lookup?.complete, false);
    assert.ok(readSheetRequest(JSON.parse(JSON.stringify(request))));
});

test('a label, code and column name past the bounds are cut with an ellipsis, and the sheet is made', () => {
    const draft = draftWithList(2, 600);
    const long = 'p'.repeat(LIMITS.columnName + 1);
    const request = sheetRequest({
        ...draft,
        columns: draft.columns.map((column) =>
            column.lookup === null ? column : { ...column, name: long },
        ),
    });
    const read = readSheetRequest(JSON.parse(JSON.stringify(request)));
    assert.ok(read);
    const column = read.columns.find((each) => each.lookup !== null);
    assert.equal(column?.name, `${'p'.repeat(LIMITS.columnName - 1)}…`);
    assert.equal(column?.lookup?.members.length, 2);
    assert.equal(column?.lookup?.members[0]?.label, `${'x'.repeat(LIMITS.term - 1)}…`);
    assert.equal(column?.lookup?.members[0]?.code, `${'x'.repeat(LIMITS.term - 1)}…`);
    assert.equal(column?.lookup?.complete, true);
});

test('a member id as long as the longest dcid the graph serves is sent whole', () => {
    const draft = draftWithList(1, 1);
    const id = 'd'.repeat(LIMITS.dcid);
    const request = sheetRequest({
        ...draft,
        columns: draft.columns.map((column) =>
            column.lookup === null
                ? column
                : {
                      ...column,
                      lookup: {
                          ...column.lookup,
                          members: column.lookup.members.map((member) => ({ ...member, id })),
                      },
                  },
        ),
    });
    const read = readSheetRequest(JSON.parse(JSON.stringify(request)));
    assert.equal(read?.columns.find((each) => each.lookup !== null)?.lookup?.members[0]?.id, id);
});

test('a list within both caps is sent whole', () => {
    const lookup = sheetRequest(draftWithList(LIMITS.members, 1)).columns.find(
        (column) => column.lookup !== null,
    )?.lookup;
    assert.equal(lookup?.members.length, LIMITS.members);
    assert.equal(lookup?.complete, true);
});

test('the closest pattern counts patterns about a narrower class, as the offered options do', () => {
    // FinancialFlow and FinancialObligation are narrower than FinancingEvent.
    const broad = withPatternClass('provenance/ONEClimateFinance', 0, 'FinancingEvent');
    const closest = closestPattern(broad, 'FinancingEvent', ['dac1AidType']);
    assert.equal(closest?.dataset, 'provenance/OECDDAC1');
    assert.equal(closest?.pattern.stat_var_count, 209);
});
