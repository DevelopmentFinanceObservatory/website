/**
 * `tableView.ts`: shared text moves to the caption, and columns sort by
 * the numbers their cells were formatted from.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cellNumber } from '../statFace.ts';
import { cellValue, sortOrder, type TableCell, type TableSort, tableView } from '../tableView.ts';

const debt = (currency: string) =>
    `Outstanding external debt denominated in ${currency} (% of public or publicly guaranteed external debt)`;

const zimbabwe = tableView(
    ['Recipient', 'Variable', 'Period', 'Value'],
    [
        ['Zimbabwe', debt('Swiss Franc'), '2000', '1.25'],
        ['Zimbabwe', debt('Euro'), '2000', '23.4 M'],
        ['Zimbabwe', debt('Swiss Franc'), '2001', '—'],
    ],
    1,
);

test('a column with one value in every row and the shared name text go to the caption', () => {
    assert.deepEqual(zimbabwe.caption, {
        lead: 'Outstanding external debt denominated in …',
        details: ['% of public or publicly guaranteed external debt', 'Recipient: Zimbabwe'],
    });
    assert.deepEqual(zimbabwe.columns, ['Variable', 'Period', 'Value']);
    assert.deepEqual(zimbabwe.rows[0], [
        { text: 'Swiss Franc', full: debt('Swiss Franc') },
        { text: '2000' },
        { text: '1.25' },
    ]);
    assert.deepEqual(zimbabwe.numeric, [false, true, true]);
    assert.equal(zimbabwe.namesColumn, 0);
});

test('only the names column is shortened, and places and donors stay whole', () => {
    const countries = tableView(
        ['', 'Value'],
        [
            ['South Sudan', '1.0'],
            ['South Africa', '2.0'],
            ['Congo, Dem. Rep.', '3.0'],
            ['Congo, Rep.', '4.0'],
        ],
    );

    assert.equal(countries.caption, null);
    assert.deepEqual(
        countries.rows.map(([name]) => name),
        [
            { text: 'South Sudan' },
            { text: 'South Africa' },
            { text: 'Congo, Dem. Rep.' },
            { text: 'Congo, Rep.' },
        ],
    );

    const donors = tableView(
        ['Donor', 'Variable', 'Value'],
        [
            ['United States', 'Gross ODA disbursements', '1.0'],
            ['United Kingdom', 'Net ODA disbursements', '2.0'],
        ],
        1,
    );

    assert.equal(donors.caption?.lead, '… ODA disbursements');
    assert.deepEqual(donors.rows, [
        [
            { text: 'United States' },
            { text: 'Gross', full: 'Gross ODA disbursements' },
            { text: '1.0' },
        ],
        [
            { text: 'United Kingdom' },
            { text: 'Net', full: 'Net ODA disbursements' },
            { text: '2.0' },
        ],
    ]);
});

test('a table whose rows differ only in value keeps every column', () => {
    const view = tableView(
        ['Recipient', 'Period', 'Value'],
        [
            ['Kenya', '2023', '1.0'],
            ['Kenya', '2023', '2.0'],
        ],
    );

    assert.equal(view.caption, null);
    assert.deepEqual(view.columns, ['Recipient', 'Period', 'Value']);
});

test('a table with nothing shared has no caption', () => {
    const view = tableView(
        ['Recipient', 'Value'],
        [
            ['Kenya', '1.0'],
            ['Ghana', '2.0'],
        ],
    );

    assert.equal(view.caption, null);
    assert.deepEqual(view.columns, ['Recipient', 'Value']);
});

test('one row keeps every column, and the value column always stays', () => {
    const view = tableView(['Recipient', 'Value'], [['Kenya', '1.0']]);

    assert.deepEqual(view.columns, ['Recipient', 'Value']);

    const same = tableView(
        ['Recipient', 'Value'],
        [
            ['Kenya', '1.0'],
            ['Ghana', '1.0'],
        ],
    );

    assert.deepEqual(same.columns, ['Recipient', 'Value']);
});

test('cellValue reads back what cellNumber wrote, in the same order', () => {
    const raw = [
        -2.5e9, -37_000, -0.25, 0, 0.5, 12.34, 441.9, 999.99, 37_000, 999_950, 23.4e6, 1.2e9, 3e12,
    ];
    const read = raw.map((value) => cellValue(cellNumber(value)));

    assert.ok(read.every((value) => value !== null));
    assert.deepEqual(
        read.map((_, index) => index).toSorted((a, b) => read[a]! - read[b]!),
        raw.map((_, index) => index),
    );
    assert.equal(cellValue('—'), null);
    assert.equal(cellValue('Missing'), null);
});

// The column's shown text, rows in sorted order.
const texts = (rows: TableCell[][], numeric: boolean[], sort: TableSort, column = sort.column) =>
    sortOrder(rows, numeric, sort).map((index) => rows[index]![column]!.text);

test('a numeric column sorts by value both ways, blanks last', () => {
    const rows = [['35.1 K'], ['—'], ['23.4 M'], ['Missing'], ['-2.0'], ['441.9']].map((row) =>
        row.map((text) => ({ text })),
    );

    assert.deepEqual(texts(rows, [true], { column: 0, direction: 'ascending' }), [
        '-2.0',
        '441.9',
        '35.1 K',
        '23.4 M',
        '—',
        'Missing',
    ]);
    assert.deepEqual(texts(rows, [true], { column: 0, direction: 'descending' }), [
        '23.4 M',
        '35.1 K',
        '441.9',
        '-2.0',
        '—',
        'Missing',
    ]);
});

test('a text column sorts by its shown text, blanks last', () => {
    const down: TableSort = { column: 0, direction: 'descending' };

    assert.deepEqual(texts(zimbabwe.rows, zimbabwe.numeric, down), [
        'Swiss Franc',
        'Swiss Franc',
        'Euro',
    ]);
    // Ties keep their order.
    assert.deepEqual(texts(zimbabwe.rows, zimbabwe.numeric, down, 1), ['2000', '2001', '2000']);

    const blanks = [['—'], ['b'], ['a']].map((row) => row.map((text) => ({ text })));

    assert.deepEqual(texts(blanks, [false], { column: 0, direction: 'ascending' }), [
        'a',
        'b',
        '—',
    ]);
});
