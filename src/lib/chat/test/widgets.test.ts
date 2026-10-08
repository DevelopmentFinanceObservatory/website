/**
 * `widgets.ts`: the card-type switcher's conversions keep the card's
 * revision, frame and values, and a table charts from its structured data.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    type CardData,
    chartFromTable,
    type ChartWidget,
    type CardInfo,
    formatAxis,
    sourceLine,
    tableFromChart,
    type TableWidget,
} from '../widgets.ts';

const REF = { component_id: 'cmp_1', revision: 2 };
const FRAME = { spec_id: 'spec_19e7', content_version: 'cv_1' };

const table = (data: CardData | undefined): TableWidget => ({
    kind: 'table',
    id: 'cmp_1',
    title: 'Aid by donor',
    columns: [],
    rows: [],
    ref: REF,
    frame: FRAME,
    data,
    source: 'OECD CRS',
});

const donorYears: CardData = {
    columns: [
        { key: 'donor', label: 'Donor' },
        { key: 'period', label: 'Period' },
        { key: 'value', label: 'Value' },
        { key: 'unit', label: 'Unit' },
    ],
    rows: [
        ['Germany', '2022', 10, 'USD'],
        ['Germany', '2023', 12, 'USD'],
        ['France', '2022', 7, 'USD'],
        ['France', '2023', null, 'USD'],
    ],
};

test('chartFromTable: plots value along the period, one series per other varying column', () => {
    const chart = chartFromTable(table(donorYears));

    assert.deepEqual(chart?.categories, ['2022', '2023']);
    assert.deepEqual(chart?.series, [
        { label: 'Germany', values: [10, 12] },
        { label: 'France', values: [7, null] },
    ]);
    assert.equal(chart?.unit, 'USD');
});

test('chartFromTable: a constant period plots along the varying column, named after the series', () => {
    const data: CardData = {
        columns: [
            { key: 'series', label: 'Series' },
            { key: 'donor', label: 'Donor' },
            { key: 'period', label: 'Period' },
            { key: 'value', label: 'Value' },
        ],
        rows: [
            ['ODA (current US$)', 'Germany', '2023', 12],
            ['ODA (current US$)', 'France', '2023', 7],
        ],
    };

    const chart = chartFromTable(table(data));

    assert.deepEqual(chart?.categories, ['Germany', 'France']);
    assert.deepEqual(chart?.series, [{ label: 'ODA', values: [12, 7] }]);
});

test('chartFromTable: null for data one bar per value cannot show', () => {
    const lone: CardData = { columns: donorYears.columns, rows: [donorYears.rows[0]!] };
    const noValue: CardData = {
        columns: [{ key: 'donor', label: 'Donor' }],
        rows: [['Germany'], ['France']],
    };
    const mixedUnit: CardData = {
        columns: donorYears.columns,
        rows: [
            ['Germany', '2022', 10, 'USD'],
            ['Germany', '2023', 0.5, 'percent'],
        ],
    };
    const sharedCoordinate: CardData = {
        columns: donorYears.columns,
        rows: [...donorYears.rows, ['Germany', '2022', 11, 'USD']],
    };

    // A column empty on every row is constant, so it labels nothing.
    const loneWithEmptyNote: CardData = {
        columns: [...donorYears.columns, { key: 'note', label: 'Note' }],
        rows: [[...donorYears.rows[0]!, null]],
    };

    for (const data of [undefined, noValue, lone, mixedUnit, sharedCoordinate, loneWithEmptyNote]) {
        assert.equal(chartFromTable(table(data)), null);
    }
});

test('chartFromTable and tableFromChart keep the ref, frame, values and source', () => {
    const chart = chartFromTable(table(donorYears)) as ChartWidget;
    const back = tableFromChart(chart);

    for (const widget of [chart, back]) {
        assert.deepEqual(widget.ref, REF);
        assert.deepEqual(widget.frame, FRAME);
        assert.deepEqual(widget.data, donorYears);
        assert.equal(widget.source, 'OECD CRS');
    }
});

test('formatAxis and tableFromChart compact a number, rolling up at a letter boundary', () => {
    assert.equal(formatAxis(37_000), '37.0K');
    assert.equal(formatAxis(999_950), '1.0M');

    const chart: ChartWidget = {
        kind: 'chart',
        id: 'cmp_1',
        chartType: 'line',
        title: 'Aid',
        categories: ['2023', '2024'],
        series: [{ label: 'Kenya', values: [37_000, 999_950] }],
    };

    assert.deepEqual(tableFromChart(chart).rows, [
        ['2023', '37.0 K'],
        ['2024', '1.0 M'],
    ]);
});

test('formatAxis writes a percentage with its sign, two decimals at most and no letter', () => {
    const cases: [number, string | undefined, string][] = [
        [5.333, 'Percent', '5.33%'],
        [2, '%', '2%'],
        [0.762, 'percentage', '0.76%'],
        [1_250, 'Percent', '1,250%'],
        [-1.5, 'Percent', '-1.5%'],
        [5.333, 'US Dollar', '5.33'],
        [37_000, 'Percent of GDP', '37.0K'],
        [37_000, undefined, '37.0K'],
    ];

    for (const [value, unit, text] of cases) {
        assert.equal(formatAxis(value, unit), text, `${value} ${unit}`);
    }
});

const info = (sources: string[], sourceName: string | null = sources[0] ?? null): CardInfo => ({
    label: 'IDS; WDI · 2 indicator(s)',
    sourceId: null,
    sourceName,
    sourceCount: sources.length,
    indicatorCount: 2,
    years: null,
    unit: null,
    indicators: [],
    licence: null,
    dataThrough: null,
    lastRefreshed: null,
    sources: sources.map((name) => ({
        id: name,
        name,
        licence: null,
        url: null,
        retrieved: null,
    })),
});

test('sourceLine names every source a card cites, each once, else its one source or label', () => {
    const cases: [CardInfo, string][] = [
        [
            info(['World Bank IDS', 'World Development Indicators']),
            'World Bank IDS; World Development Indicators',
        ],
        [info(['World Bank IDS', 'World Bank IDS']), 'World Bank IDS'],
        [info(['World Bank IDS']), 'World Bank IDS'],
        [info([]), 'IDS; WDI · 2 indicator(s)'],
        // A card saved before its sources were kept names the one it held.
        [{ ...info([], 'World Bank IDS'), sources: undefined }, 'World Bank IDS'],
    ];

    for (const [card, line] of cases) {
        assert.equal(sourceLine(card), line);
    }
});
