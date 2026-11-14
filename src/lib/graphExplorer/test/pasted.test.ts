/**
 * `pasted.ts`: reading a pasted range, mapping its headers against the test
 * documents, building check rows and placing findings.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import {
    applySwitches,
    locateFinding,
    mapHeaders,
    parsePasted,
    rowsToCheck,
    sheetProblems,
    switchColumn,
} from '../pasted.ts';
import {
    CHECK_MAX_CONSTRAINT_PROPERTIES,
    DCID_MAX_LENGTH,
    readOntology,
    readProvenances,
} from '../wire.ts';
import type { OntologyFinding } from '../wire.ts';
import { ontologyBody, provenancesBody } from './fixtures.ts';

const model = buildModel(readOntology(ontologyBody()), readProvenances(provenancesBody()));

test('a pasted range keeps quoted tabs, line breaks and quotes and drops trailing blank rows', () => {
    const text =
        'code\tlabel\tnote\r\n' +
        'A1\tFirst\t"has a\ttab and a\nline break and ""quotes"""\r\n' +
        'A2\tSecond\t\r\n' +
        '\t\t\r\n' +
        '\r\n';
    const { header, rows } = parsePasted(text);
    assert.deepEqual(header, ['code', 'label', 'note']);
    assert.deepEqual(rows, [
        ['A1', 'First', 'has a\ttab and a\nline break and "quotes"'],
        ['A2', 'Second', ''],
    ]);
});

test('comma-separated text is read with the same quote rules', () => {
    const text =
        'dcid,measuredProperty,note\r\nsv1,amount,"a comma, and a\nline break"\r\nsv2,amount,\r\n';
    const { header, rows } = parsePasted(text);
    assert.deepEqual(header, ['dcid', 'measuredProperty', 'note']);
    assert.deepEqual(rows, [
        ['sv1', 'amount', 'a comma, and a\nline break'],
        ['sv2', 'amount', ''],
    ]);
});

for (const [name, text, header, rows] of [
    [
        'a tab in the header reads commas as text',
        'code\tlabel\nA1\tOne, two\n',
        ['code', 'label'],
        [['A1', 'One, two']],
    ],
    [
        'a tab after a quoted line break in the header',
        '"source\ncode"\tmeasuredProperty\nX1\tamount\n',
        ['source\ncode', 'measuredProperty'],
        [['X1', 'amount']],
    ],
    [
        'a tab inside a quoted header cell',
        '"a\tb",measuredProperty\nX1,amount\n',
        ['a\tb', 'measuredProperty'],
        [['X1', 'amount']],
    ],
] as const) {
    test(`the delimiter is read from the header record: ${name}`, () => {
        assert.deepEqual(parsePasted(text), { header, rows });
    });
}

test('a byte-order mark before a quoted first header is dropped', () => {
    assert.deepEqual(parsePasted('\uFEFF"dcid"\tmeasuredProperty\n').header, [
        'dcid',
        'measuredProperty',
    ]);
});

test('a quote that opens a cell and never closes is read as text', () => {
    const { rows } = parsePasted(
        'dcid\tmeasuredProperty\n"sv1\tamount\nsv2\tamount\nsv3\tamount\n',
    );
    assert.deepEqual(rows, [
        ['"sv1', 'amount'],
        ['sv2', 'amount'],
        ['sv3', 'amount'],
    ]);
});

test('a quote followed by anything but a delimiter or line end does not close a cell', () => {
    const { rows } = parsePasted(
        'label\tmeasuredProperty\n"Big\tamount\nmid\tamount\n"Small\tamount\n',
    );
    assert.deepEqual(rows, [
        ['"Big', 'amount'],
        ['mid', 'amount'],
        ['"Small', 'amount'],
    ]);
});

test('an empty paste has no header and no rows', () => {
    assert.deepEqual(parsePasted(''), { header: [], rows: [] });
});

const target = (mapping: ReturnType<typeof mapHeaders>, index: number) => mapping[index]?.target;

test('headers map to definition fields in either case, to properties, or to nothing', () => {
    const mapping = mapHeaders(model, [
        'source_code',
        'measured_property',
        'populationType',
        'observation_properties',
        'nettingBasis',
        'netting_basis',
        'dac_1_aid_type',
        'financialFlowType ',
        'dcid',
    ]);
    assert.deepEqual(target(mapping, 0), { kind: 'ignored' });
    assert.deepEqual(target(mapping, 1), { kind: 'definition', field: 'measuredProperty' });
    assert.deepEqual(target(mapping, 2), { kind: 'definition', field: 'populationType' });
    assert.deepEqual(target(mapping, 3), { kind: 'definition', field: 'observationProperties' });
    assert.deepEqual(target(mapping, 4), { kind: 'property', property: 'nettingBasis' });
    // A second column naming nettingBasis repeats column 4 and is ignored.
    assert.deepEqual(target(mapping, 5), { kind: 'ignored' });
    assert.equal(mapping[5]?.duplicateOf, 4);
    assert.deepEqual(target(mapping, 6), { kind: 'ignored' });
    assert.deepEqual(target(mapping, 7), { kind: 'property', property: 'financialFlowType' });
    assert.deepEqual(target(mapping, 8), { kind: 'definition', field: 'dcid' });
    assert.deepEqual(
        mapping.map((column) => column.index),
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
    );
});

test('a column switches between property and ignored without touching the others', () => {
    const mapping = mapHeaders(model, ['measuredProperty', 'netting_basis', 'Region']);
    const ignored = switchColumn(mapping, 1, 'ignored');
    assert.deepEqual(target(ignored, 1), { kind: 'ignored' });
    assert.deepEqual(target(ignored, 0), target(mapping, 0));

    const property = switchColumn(mapping, 2, 'property');
    assert.deepEqual(target(property, 2), { kind: 'property', property: 'Region' });
    assert.deepEqual(target(mapping, 2), { kind: 'ignored' });
});

test('rows to check number rows as the sheet shows them and apply the empty-cell rules', () => {
    const mapping = mapHeaders(model, [
        'source_code',
        'populationType',
        'measuredProperty',
        'observationProperties',
        'nettingBasis',
        'financialFlowType',
    ]);
    const rows = rowsToCheck(mapping, [
        ['X1', 'FinancialFlow', 'amount', 'financingProvider, financingRecipient', 'Gross', ''],
        ['X2', 'FinancialFlow', '', '', '', 'Buyback'],
        ['', '', '', '', '', ''],
        ['X4', '', 'amount', '', 'Net', 'Buyback'],
    ]);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
        ref: '2',
        dcid: null,
        population_type: 'FinancialFlow',
        measured_property: 'amount',
        stat_type: null,
        measurement_qualifier: null,
        measurement_denominator: null,
        constraint_properties: { nettingBasis: 'Gross' },
        observation_properties: ['financingProvider', 'financingRecipient'],
    });
    assert.equal(rows[1]?.ref, '3');
    assert.equal(rows[1]?.measured_property, '');
    assert.deepEqual(rows[1]?.constraint_properties, { financialFlowType: 'Buyback' });
    assert.deepEqual(rows[1]?.observation_properties, []);
    assert.equal(rows[2]?.ref, '5');
    assert.equal(rows[2]?.population_type, null);
});

/** The problems of a sheet with `header` and `cells`, as code, column and rows. */
const problemsOf = (header: string[], cells: string[][], switches: [number, 'property'][] = []) => {
    let mapping = mapHeaders(model, header);
    for (const [index, to] of switches) mapping = switchColumn(mapping, index, to);
    return sheetProblems(mapping, rowsToCheck(mapping, cells)).map(({ code, column, rows }) => ({
        code,
        column,
        rows,
    }));
};

test('a sheet the check would refuse is caught before any request, one problem per cause and column', () => {
    const tooMany = Array.from(
        { length: CHECK_MAX_CONSTRAINT_PROPERTIES + 1 },
        (_, at) => `p${at}`,
    );
    const cases: [string, string[], string[][], [number, 'property'][], unknown[]][] = [
        ['a clean sheet', ['measuredProperty', 'nettingBasis'], [['amount', 'Gross']], [], []],
        [
            'no measuredProperty column',
            ['nettingBasis'],
            [['Gross'], ['Net']],
            [],
            [{ code: 'measured_property_missing', column: null, rows: [] }],
        ],
        [
            'an empty measured property',
            ['source_code', 'measuredProperty'],
            [
                ['A', 'amount'],
                ['B', ''],
                ['C', ''],
            ],
            [],
            [{ code: 'measured_property_missing', column: 1, rows: [3, 4] }],
        ],
        [
            'a definition value that is not a dcid',
            ['measuredProperty', 'populationType'],
            [
                ['amount', 'Financial Flow'],
                ['amount', 'FinancialFlow'],
            ],
            [],
            [{ code: 'value_not_dcid', column: 1, rows: [2] }],
        ],
        [
            'too many observation properties, one not a dcid',
            ['measuredProperty', 'observationProperties'],
            [
                ['amount', 'a, b, c, d, e'],
                ['amount', 'a b'],
            ],
            [],
            [
                { code: 'value_not_dcid', column: 1, rows: [3] },
                { code: 'too_many_observation_properties', column: 1, rows: [2] },
            ],
        ],
        [
            'too many filled property columns',
            ['measuredProperty', ...tooMany],
            [
                ['amount', ...tooMany.map(() => 'X')],
                ['amount', ...tooMany.map((_, at) => (at ? 'X' : ''))],
            ],
            tooMany.map((_, at): [number, 'property'] => [at + 1, 'property']),
            [{ code: 'too_many_constraint_properties', column: null, rows: [2] }],
        ],
        [
            'a property header that is not a dcid, filled on one row',
            ['measuredProperty', 'Aid type'],
            [
                ['amount', 'X'],
                ['amount', ''],
            ],
            [[1, 'property']],
            [{ code: 'property_not_dcid', column: 1, rows: [2] }],
        ],
        [
            'a property value past the length ceiling',
            ['measuredProperty', 'nettingBasis'],
            [['amount', 'x'.repeat(DCID_MAX_LENGTH + 1)]],
            [],
            [{ code: 'value_too_long', column: 1, rows: [2] }],
        ],
    ];
    for (const [name, header, cells, switches, expected] of cases) {
        assert.deepEqual(problemsOf(header, cells, switches), expected, name);
    }
});

test('a repeated property keeps its first column, and the check reads and marks that one', () => {
    const { header, rows } = parsePasted('measuredProperty,sex,sex\namount,Male,Femal\n');
    // The test model has no sex property, so the reader switches both columns to Property.
    const mapping = applySwitches(
        mapHeaders(model, header),
        new Map([
            [1, { header: 'sex', to: 'property' as const }],
            [2, { header: 'sex', to: 'property' as const }],
        ]),
    );
    assert.deepEqual(
        mapping.map((column) => [column.target.kind, column.duplicateOf]),
        [
            ['definition', null],
            ['property', null],
            ['ignored', 1],
        ],
    );
    const [row] = rowsToCheck(mapping, rows);
    assert.deepEqual(row?.constraint_properties, { sex: 'Male' });
    const flagged: OntologyFinding = {
        ref: row?.ref ?? null,
        field: 'constraint_properties.sex',
        value: 'Male',
        code: 'node_not_held',
        severity: 'error',
    };
    assert.deepEqual(locateFinding(mapping, flagged), { row: 2, column: 1 });

    // Ignoring the first column hands the property to the second; switching
    // it back makes the second a repeat again.
    const handed = switchColumn(mapping, 1, 'ignored');
    assert.deepEqual(
        handed.map((column) => [column.target.kind, column.duplicateOf]),
        [
            ['definition', null],
            ['ignored', null],
            ['property', null],
        ],
    );
    assert.deepEqual(rowsToCheck(handed, rows)[0]?.constraint_properties, { sex: 'Femal' });
    assert.equal(locateFinding(handed, flagged)?.column, 2);
    assert.equal(switchColumn(handed, 1, 'property')[2]?.duplicateOf, 1);
});

test('a repeated definition field keeps its first column', () => {
    const mapping = mapHeaders(model, ['measured_property', 'measuredProperty']);
    assert.equal(mapping[1]?.duplicateOf, 0);
    const [row] = rowsToCheck(mapping, [['', 'amount']]);
    assert.equal(row?.measured_property, '');
});

const finding = (field: string, ref: string | null = '3'): OntologyFinding => ({
    ref,
    field,
    value: 'x',
    code: 'node_not_held',
    severity: 'error',
});

test('a finding locates to the column of its constraint property or definition field', () => {
    const mapping = mapHeaders(model, ['source_code', 'measured_property', 'nettingBasis']);
    assert.deepEqual(locateFinding(mapping, finding('constraint_properties.nettingBasis')), {
        row: 3,
        column: 2,
    });
    assert.deepEqual(locateFinding(mapping, finding('measured_property')), { row: 3, column: 1 });
});

test('a finding whose field has no column locates to its row alone', () => {
    const mapping = mapHeaders(model, ['measured_property']);
    assert.deepEqual(locateFinding(mapping, finding('constraint_properties.nettingBasis')), {
        row: 3,
        column: null,
    });
    assert.deepEqual(locateFinding(mapping, finding('stat_type')), { row: 3, column: null });
    assert.equal(locateFinding(mapping, finding('measured_property', null)), null);
    assert.equal(locateFinding(mapping, finding('measured_property', 'row 2')), null);
});

test('a column switch holds while its header reads the same and drops when it changes', () => {
    const switches = new Map([
        [0, { header: 'nettingBasis', to: 'ignored' as const }],
        [1, { header: 'crsPurpos', to: 'property' as const }],
    ]);
    const before = mapHeaders(model, ['nettingBasis', 'crsPurpos']);
    assert.deepEqual(
        applySwitches(before, switches).map((column) => column.target.kind),
        ['ignored', 'property'],
    );

    const renamed = mapHeaders(model, ['nettingBasis', 'crsPurpose_typo']);
    assert.deepEqual(
        applySwitches(renamed, switches).map((column) => column.target.kind),
        ['ignored', 'ignored'],
    );
    assert.equal(applySwitches(renamed, switches)[1], renamed[1]);
});
