/**
 * `tableFit.ts`: the display table every caller builds, when it turns on its
 * side, where the unit goes, and the card's estimated width and height.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { readMetrics } from '../../../../motion-kit/fontMetrics.ts';
import type { CardData, CardInfo, TableWidget } from '../../chat/widgets.ts';
import { OUTFIT_ADVANCES, OUTFIT_CHARS } from '../outfitAdvances.ts';
import {
    TABLE_ROWS_COLLAPSED,
    TABLE_WIDTH_DEFAULT,
    tableDisplay,
    tableRows,
    tableUnit,
    tableWidthCells,
    textWidth,
    transposed,
    unitFitsHeader,
} from '../tableFit.ts';

const FONTS = fileURLToPath(
    new URL('../../../../node_modules/@fontsource/outfit/files', import.meta.url),
);

const info = (unit: string | null): CardInfo => ({
    label: 'WorldDevelopmentIndicators · 1 indicator(s)',
    sourceId: null,
    sourceName: 'World Bank',
    sourceCount: 1,
    indicatorCount: 1,
    years: null,
    unit,
    licence: null,
    dataThrough: null,
    lastRefreshed: null,
});

type Fixture = Pick<
    TableWidget,
    'title' | 'columns' | 'rows' | 'namesColumn' | 'series' | 'info' | 'data' | 'source'
>;

const widget = (fields: Partial<Fixture> & Pick<Fixture, 'columns' | 'rows'>): Fixture => ({
    title: 'Health aid per person',
    info: info(null),
    ...fields,
});

// Health aid per person: periods down, one column per country.
const COUNTRIES = ['Nigeria', 'Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Mozambique', 'Ghana'];
const periodsBySeries = (periods: number): Fixture =>
    widget({
        series: true,
        columns: ['Period', ...COUNTRIES],
        rows: Array.from({ length: periods }, (_, at) => [
            String(2020 + at),
            ...COUNTRIES.map((_, country) => `${(at + country + 2.25).toFixed(2)}`),
        ]),
    });

// A payload table: its headers are its data's column labels.
const recipients = (count: number, unit: string | null = null): Fixture =>
    widget({
        columns: ['Recipient', 'Value'],
        rows: Array.from({ length: count }, (_, at) => [`Country ${at}`, `${at}.5`]),
        info: info(unit),
        data: {
            columns: [
                { key: 'recipient', label: 'Recipient' },
                { key: 'value', label: 'Value' },
            ],
            rows: Array.from({ length: count }, (_, at) => [`Country ${at}`, at + 0.5]),
        },
    });

test('the committed advances are the ones the Outfit files carry', () => {
    for (const weight of [300, 400, 700] as const) {
        const metrics = readMetrics(`${FONTS}/outfit-latin-${weight}-normal.woff`);
        const read = [...OUTFIT_CHARS].map((char) => metrics.advance(char.codePointAt(0)!));

        assert.equal(metrics.unitsPerEm, 1000);
        assert.deepEqual(read, OUTFIT_ADVANCES[weight]);
    }
});

test('table figures are tabular, and an unknown character counts as the widest', () => {
    assert.equal(textWidth('1111', 700, 10), textWidth('0000', 700, 10));
    assert.ok(textWidth('漢', 400, 10) >= textWidth('W', 400, 10));
});

test('transposed turns the raw cells, its names down the first column', () => {
    assert.deepEqual(
        transposed({
            columns: ['Period', 'Kenya', 'Ghana'],
            rows: [
                ['2020', '1.0', '2.0'],
                ['2021', '3.0'],
            ],
        }),
        {
            columns: ['', '2020', '2021'],
            rows: [
                ['Kenya', '1.0', '3.0'],
                ['Ghana', '2.0', '—'],
            ],
            namesColumn: 0,
        },
    );
});

test('a series table wider than the default width turns when it then fits', () => {
    const wide = periodsBySeries(3);
    const display = tableDisplay(wide);

    assert.equal(display.transposed, true);
    assert.deepEqual(display.view.columns, ['', '2020', '2021', '2022']);
    assert.ok(tableWidthCells(display) <= TABLE_WIDTH_DEFAULT);
    // The same cells as a payload table never turn.
    assert.ok(tableWidthCells(tableDisplay({ ...wide, series: undefined })) > TABLE_WIDTH_DEFAULT);
    assert.equal(tableDisplay({ ...wide, series: undefined }).transposed, false);
});

test('a series table stays as it is when it fits, runs long, or fits neither way', () => {
    // Fits: two countries.
    const narrow = periodsBySeries(3);
    const two = {
        ...narrow,
        columns: narrow.columns.slice(0, 3),
        rows: narrow.rows.map((row) => row.slice(0, 3)),
    };

    assert.equal(tableDisplay(two).transposed, false);
    // More rows than columns.
    assert.equal(tableDisplay(periodsBySeries(12)).transposed, false);

    // Too wide either way: long country names down the side.
    const long = periodsBySeries(5);
    const named = {
        ...long,
        columns: long.columns.map((name) =>
            name === 'Kenya' ? 'Democratic Republic of the Congo' : name,
        ),
    };

    assert.ok(tableWidthCells(tableDisplay(named)) > TABLE_WIDTH_DEFAULT);
    assert.equal(tableDisplay(named).transposed, false);
});

test('the unit heads the value column when it fits two header lines', () => {
    assert.deepEqual(tableDisplay(recipients(3, 'US$ per person')).view.columns, [
        'Recipient',
        'US$ per person',
    ]);

    const long = 'US Dollar, millions, constant 2023 prices';

    assert.equal(unitFitsHeader('US$ per person'), true);
    assert.equal(unitFitsHeader(long), false);

    const view = tableDisplay(recipients(3, long)).view;

    assert.deepEqual(view.columns, ['Recipient', 'Value']);
    assert.deepEqual(view.caption?.details, [long]);
});

test('a series table says its unit in the caption', () => {
    const view = tableDisplay({ ...periodsBySeries(12), info: info('US$ per person') }).view;

    assert.equal(view.columns.at(-1), 'Ghana');
    assert.deepEqual(view.caption?.details, ['US$ per person']);
});

test('a sketch table saved without the series flag keeps its series headers', () => {
    const unit = 'US$';
    const view = tableDisplay(
        widget({
            columns: ['Period', 'Kenya', 'Uganda'],
            rows: [
                ['2021', '4.90', '4.00'],
                ['2022', '5.10', '4.20'],
            ],
            info: info(unit),
            data: {
                columns: [
                    { key: 'series', label: 'Series' },
                    { key: 'period', label: 'Period' },
                    { key: 'value', label: 'Value' },
                    { key: 'unit', label: 'Unit' },
                ],
                rows: [
                    ['Kenya', '2021', 4.9, unit],
                    ['Kenya', '2022', 5.1, unit],
                    ['Uganda', '2021', 4, unit],
                    ['Uganda', '2022', 4.2, unit],
                ],
            },
        }),
    ).view;

    assert.deepEqual(view.columns, ['Period', 'Kenya', 'Uganda']);
    assert.deepEqual(view.caption?.details, [unit]);
});

test('a table whose rows mix units has no one unit', () => {
    const data = (units: string[]): CardData => ({
        columns: [
            { key: 'recipient', label: 'Recipient' },
            { key: 'value', label: 'Value' },
            { key: 'unit', label: 'Unit' },
        ],
        rows: units.map((unit, at) => [`Country ${at}`, at, unit]),
    });

    assert.equal(tableUnit({ info: info('US Dollar'), data: data(['USD', 'USD']) }), 'US Dollar');
    assert.equal(tableUnit({ info: info('US Dollar'), data: data(['USD', 'EUR']) }), null);
    assert.equal(tableUnit({ info: info(null), data: data(['USD']) }), null);
});

test('the estimated width grows with the text and holds the padding when empty', () => {
    const short = tableWidthCells(tableDisplay(recipients(3)));
    const longer = recipients(3);

    longer.rows[0]![0] = 'Saint Vincent and the Grenadines';

    assert.ok(tableWidthCells(tableDisplay(longer)) > short);
    assert.ok(tableWidthCells(tableDisplay(widget({ columns: [], rows: [] }))) >= 2);
});

test('a row label past the cap adds no width, as its ellipsis adds none on the card', () => {
    const labelled = (label: string): number => {
        const table = recipients(3);

        table.rows[0]![0] = label;

        return tableWidthCells(tableDisplay(table));
    };
    const long = 'Bureau of Population, Refugees and Migration, United States';

    assert.ok(labelled(long) > labelled('Kenya'));
    assert.equal(labelled(`${long}, Department of State`), labelled(long));
});

test('the estimated height runs 28 px a row, and stops at the collapsed rows', () => {
    const rows = (count: number, expanded = false) =>
        tableRows({ widget: recipients(count), widthCells: 22, expanded });

    // Five rows are 140 px, seven cells.
    assert.equal(rows(8) - rows(3), 7);
    assert.equal(rows(40, true) - rows(35, true), 7);
    // Past the collapsed rows only the "Show all" control is added.
    assert.equal(rows(TABLE_ROWS_COLLAPSED + 1), rows(40));
    assert.ok(rows(TABLE_ROWS_COLLAPSED + 1) >= rows(TABLE_ROWS_COLLAPSED));
    assert.ok(rows(40, true) > rows(40));
});

test('a table wider than its card makes room for the scrollbar', () => {
    // Five row counts step the height through every px offset in a cell, so
    // the 8 px bar tips at least one of them into another cell.
    const tables = [1, 2, 3, 4, 5].map((count) => ({
        ...periodsBySeries(count),
        series: undefined,
        title: 'Aid',
    }));
    const extra = tables.map((wide) => {
        const natural = tableWidthCells(tableDisplay(wide));

        return (
            tableRows({ widget: wide, widthCells: natural - 4 }) -
            tableRows({ widget: wide, widthCells: natural })
        );
    });

    assert.ok(extra.includes(1));
    assert.ok(extra.every((cells) => cells === 0 || cells === 1));
});
