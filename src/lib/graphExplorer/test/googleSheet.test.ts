/**
 * `googleSheet.ts`: the request body's bounds, and the Sheets API request
 * bodies for a sheet built from the fixture documents.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    columnLetters,
    createSpreadsheetBody,
    dropdownRequestBody,
    LIMITS,
    readSheetRequest,
    type SheetRequest,
} from '../googleSheet.ts';
import { buildModel } from '../model.ts';
import { exampleRows, sheetColumns } from '../sheet.ts';
import { readOntology, readProvenances } from '../wire.ts';
import { ontologyBody, provenancesBody } from './fixtures.ts';

const model = buildModel(readOntology(ontologyBody()), readProvenances(provenancesBody()));

const columns = sheetColumns(model, {
    classId: 'FinancialFlow',
    measuredProperty: 'amount',
    statType: 'measuredValue',
    qualifier: 'Nominal',
    properties: ['nettingBasis', 'dac1AidType', 'financingProvider'],
});

/** The body the page sends for the fixture sheet, as plain JSON. */
const fixtureRequest = (): SheetRequest =>
    JSON.parse(
        JSON.stringify({
            title: 'Financial flow',
            generation: model.generation,
            columns: columns.map(({ name, kind, lookup }) => ({ name, kind, lookup })),
            rows: exampleRows(columns),
        }),
    );

const text = (length: number) => 'x'.repeat(length);

const member = (at: number) => ({ id: `M${at}`, label: `member ${at}`, code: null });

/** A request of `count` property columns, each with one member. */
const withColumns = (count: number) => ({
    title: 'T',
    generation: null,
    columns: Array.from({ length: count }, (_, at) => ({
        name: `p${at}`,
        kind: 'property',
        lookup: { valueList: 'L', members: [member(at)] },
    })),
    rows: [],
});

test('the fixture sheet passes its bounds unchanged', () => {
    const request = fixtureRequest();
    assert.deepEqual(readSheetRequest(request), request);
});

type Edit = (request: Record<string, any>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any -- tests reach into plain JSON

const bounds: [string, Edit, Edit][] = [
    [
        'title length',
        (r) => (r.title = text(LIMITS.title)),
        (r) => (r.title = text(LIMITS.title + 1)),
    ],
    ['empty title', (r) => (r.title = 'x'), (r) => (r.title = '')],
    [
        'generation',
        (r) => (r.generation = text(LIMITS.generation)),
        (r) => (r.generation = text(LIMITS.generation + 1)),
    ],
    ['generation type', (r) => (r.generation = null), (r) => (r.generation = 7)],
    [
        'rows',
        (r) => (r.rows = Array.from({ length: LIMITS.rows }, () => r.rows[0])),
        (r) => (r.rows = Array.from({ length: LIMITS.rows + 1 }, () => r.rows[0])),
    ],
    ['row width', (r) => r.rows[0].splice(0, 1, 'a'), (r) => r.rows[0].push('extra')],
    [
        'cell length',
        (r) => (r.rows[0][0] = text(LIMITS.cell)),
        (r) => (r.rows[0][0] = text(LIMITS.cell + 1)),
    ],
    [
        'column name',
        (r) => (r.columns[0].name = text(LIMITS.columnName)),
        (r) => (r.columns[0].name = text(LIMITS.columnName + 1)),
    ],
    [
        'column kind',
        (r) => (r.columns[0].kind = 'definition'),
        (r) => (r.columns[0].kind = 'formula'),
    ],
    [
        'members per lookup',
        (r) =>
            (r.columns[6].lookup.members = Array.from({ length: LIMITS.members }, (_, at) =>
                member(at),
            )),
        (r) =>
            (r.columns[6].lookup.members = Array.from({ length: LIMITS.members + 1 }, (_, at) =>
                member(at),
            )),
    ],
    [
        'member label',
        (r) => (r.columns[6].lookup.members[0].label = text(LIMITS.term)),
        (r) => (r.columns[6].lookup.members[0].label = text(LIMITS.term + 1)),
    ],
    [
        'member code',
        (r) => (r.columns[6].lookup.members[0].code = text(LIMITS.term)),
        (r) => (r.columns[6].lookup.members[0].code = 5),
    ],
    [
        'member id',
        (r) => (r.columns[6].lookup.members[0].id = 'x'),
        (r) => (r.columns[6].lookup.members[0].id = ''),
    ],
    [
        'value list',
        (r) => (r.columns[6].lookup.valueList = text(LIMITS.term)),
        (r) => (r.columns[6].lookup.valueList = text(LIMITS.term + 1)),
    ],
];

for (const [name, atBound, pastBound] of bounds) {
    test(`a request at the ${name} bound passes and one past it is refused`, () => {
        const at = fixtureRequest();
        atBound(at);
        assert.notEqual(readSheetRequest(at), null);
        const past = fixtureRequest();
        pastBound(past);
        assert.equal(readSheetRequest(past), null);
    });
}

test('a request holds between one and LIMITS.columns columns', () => {
    assert.notEqual(readSheetRequest(withColumns(LIMITS.columns)), null);
    assert.equal(readSheetRequest(withColumns(LIMITS.columns + 1)), null);
    assert.equal(readSheetRequest(withColumns(0)), null);
});

test('a body that is not an object is refused', () => {
    for (const body of [null, [], 'sheet', 3]) assert.equal(readSheetRequest(body), null);
});

test('column letters count A to Z, then AA', () => {
    assert.deepEqual([0, 25, 26, 51, 52, 701, 702].map(columnLetters), [
        'A',
        'Z',
        'AA',
        'AZ',
        'BA',
        'ZZ',
        'AAA',
    ]);
});

test('the create body holds the mapping tab: bold frozen header, example rows, the note', () => {
    const request = fixtureRequest();
    const body = createSpreadsheetBody(request, '2026-11-13');
    assert.equal(body.properties.title, 'Financial flow mapping sheet');

    const [mapping] = body.sheets;
    assert.deepEqual(mapping?.properties, {
        sheetId: 0,
        title: 'Mapping sheet',
        index: 0,
        gridProperties: { rowCount: 1001, columnCount: 26, frozenRowCount: 1 },
    });
    const rows = mapping?.data[0]?.rowData ?? [];
    assert.equal(rows.length, 1 + request.rows.length);
    const header = rows[0]?.values ?? [];
    assert.deepEqual(
        header.map((cell) => cell.userEnteredValue?.stringValue),
        columns.map((column) => column.name),
    );
    assert.ok(header.every((cell) => cell.userEnteredFormat?.textFormat.bold));
    assert.match(String(header[0]?.note), /2026-11-13 from graph generation fixture\./);
    assert.deepEqual(
        rows[1]?.values.map((cell) => cell.userEnteredValue?.stringValue),
        request.rows[0],
    );
});

test('a model with no generation says so in the note', () => {
    const body = createSpreadsheetBody({ ...fixtureRequest(), generation: null }, '2026-11-13');
    const first = body.sheets[0]?.data[0]?.rowData[0]?.values[0];
    assert.match(String(first?.note), /a graph with no generation recorded/);
});

test('the value-list tab holds one block of dcid, label and code per property with a value list', () => {
    const tab = createSpreadsheetBody(fixtureRequest(), '2026-11-13').sheets[1];
    assert.deepEqual(tab?.properties, {
        sheetId: 1,
        title: 'Value lists',
        index: 1,
        gridProperties: { rowCount: 19, columnCount: 7, frozenRowCount: 2 },
    });
    const cells = (tab?.data[0]?.rowData ?? []).map((row) =>
        row.values.map((cell) => cell.userEnteredValue?.stringValue ?? ''),
    );
    assert.deepEqual(cells[0], ['nettingBasis', '', '', '', 'dac1AidType', '', '']);
    assert.deepEqual(cells[1], ['dcid', 'label', 'code', '', 'dcid', 'label', 'code']);
    assert.deepEqual(cells[2]?.slice(0, 3), ['Gross', 'gross', '']);
    assert.deepEqual(cells[2]?.slice(4), [
        'DAC1AidType5',
        'official and private flow (DAC 1 aid type)',
        '5',
    ]);
    assert.deepEqual(cells[4]?.slice(0, 3), ['', '', '']);
    assert.equal(cells.length, 2 + 17);
});

test('one dropdown per property column with a value list, none on reference or definition columns', () => {
    const body = dropdownRequestBody(fixtureRequest());
    assert.deepEqual(
        body?.requests.map(({ setDataValidation: { range, rule } }) => [
            range.startColumnIndex,
            range.endColumnIndex,
            rule.condition.values[0]?.userEnteredValue,
        ]),
        [
            [6, 7, "='Value lists'!$A$3:$A$4"],
            [7, 8, "='Value lists'!$E$3:$E$19"],
        ],
    );
    for (const { setDataValidation } of body?.requests ?? []) {
        assert.equal(setDataValidation.range.sheetId, 0);
        assert.equal(setDataValidation.range.startRowIndex, 1);
        assert.equal(setDataValidation.range.endRowIndex, 1001);
        assert.equal(setDataValidation.rule.condition.type, 'ONE_OF_RANGE');
        assert.equal(setDataValidation.rule.showCustomUi, true);
    }
});

test('a sheet with no value-list column needs no dropdown request', () => {
    const request = fixtureRequest();
    const bare = {
        ...request,
        columns: request.columns.map((column) => ({ ...column, lookup: null })),
    };
    assert.equal(dropdownRequestBody(bare), null);
    const tab = createSpreadsheetBody(bare, '2026-11-13').sheets[1];
    assert.equal(tab?.data[0]?.rowData.length, 1);
});

test('a reference or definition column gets no block or dropdown, even when sent a lookup', () => {
    const request = fixtureRequest();
    const lookup = request.columns[6]?.lookup ?? null;
    const moved = {
        ...request,
        columns: request.columns.map((column, at) =>
            at === 0 || at === 2 ? { ...column, lookup } : column,
        ),
    };
    assert.deepEqual(
        dropdownRequestBody(moved)?.requests.map(
            ({ setDataValidation }) => setDataValidation.range.startColumnIndex,
        ),
        [6, 7],
    );
});
