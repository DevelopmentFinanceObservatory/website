/**
 * `tableView.ts`: shared text moves to the caption, the unit heads the value
 * column or leads the caption, decimals line up, repeated names show once,
 * and columns sort by the numbers their cells were formatted from.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cellNumber } from '../statFace.ts';
import {
    cellValue,
    repeatedNames,
    sortOrder,
    type TableCell,
    type TableSort,
    tableView,
} from '../tableView.ts';

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

test('the unit heads the value column, or leads the caption details', () => {
    const rows = [
        ['Kenya', '2023', '5.14'],
        ['Ghana', '2023', '4.48'],
    ];
    const header = tableView(['Recipient', 'Period', 'Value'], rows, undefined, {
        unit: { text: 'US$ per person', place: 'header' },
    });

    assert.deepEqual(header.columns, ['Recipient', 'US$ per person']);
    assert.deepEqual(header.caption?.details, ['Period: 2023']);

    const caption = tableView(['Recipient', 'Period', 'Value'], rows, undefined, {
        unit: { text: 'US Dollar, millions, constant 2023 prices', place: 'caption' },
    });

    assert.deepEqual(caption.columns, ['Recipient', 'Value']);
    assert.deepEqual(caption.caption?.details, [
        'US Dollar, millions, constant 2023 prices',
        'Period: 2023',
    ]);
});

test('a numeric column pads its plain numbers to its most decimals, two at most', () => {
    const view = tableView(
        ['Period', 'Kenya', 'Ghana'],
        [
            ['2020', '5', '1'],
            ['2021', '4.25', '37.0 K'],
            ['2022', '1.5', '—'],
            ['2023', '—', 'Missing'],
        ],
    );
    const column = (index: number) => view.rows.map((row) => row[index]!.text);

    assert.deepEqual(column(0), ['2020', '2021', '2022', '2023']);
    assert.deepEqual(column(1), ['5.00', '4.25', '1.50', '—']);
    // A lettered number keeps its one decimal and sets no width for the rest.
    assert.deepEqual(column(2), ['1', '37.0 K', '—', 'Missing']);
    assert.deepEqual(column(1).map(cellValue), [5, 4.25, 1.5, null]);
});

test('a name repeated down the shown rows shows once a run', () => {
    const view = tableView(
        ['Recipient', 'Period', 'Value'],
        [
            ['Kenya', '2022', '1.0'],
            ['Kenya', '2023', '3.0'],
            ['Ghana', '2023', '2.0'],
            ['—', '2023', '4.0'],
            ['—', '2024', '5.0'],
        ],
    );

    assert.deepEqual(repeatedNames(view, [0, 1, 2, 3, 4]), [false, true, false, false, false]);
    // Sorting by value breaks the run, so the name shows again.
    assert.deepEqual(
        repeatedNames(
            view,
            sortOrder(view.rows, view.numeric, { column: 2, direction: 'ascending' }),
        ),
        [false, false, false, false, false],
    );

    const values = tableView(['Value'], [['1.0'], ['1.0']]);

    assert.deepEqual(repeatedNames(values, [0, 1]), [false, false]);
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
