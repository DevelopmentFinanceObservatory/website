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
    type SourceCredit,
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

test('tableFromChart marks the series names as the names column only when they run down', () => {
    const chart = (categories: string[]): ChartWidget => ({
        kind: 'chart',
        id: 'cmp_1',
        chartType: 'bar',
        title: 'Aid',
        categories,
        series: [
            { label: 'Gross ODA disbursements', values: [1, 2] },
            { label: 'Net ODA disbursements', values: [3, 4] },
        ],
    });

    // One year: one row per series, its names down the first column.
    assert.equal(tableFromChart(chart(['2023'])).namesColumn, 0);
    // Categories down (countries, years): names that must stay whole.
    assert.equal(tableFromChart(chart(['South Sudan', 'South Africa'])).namesColumn, undefined);
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

// A stored description as a card saves it, with the members the card face
// reads: what it describes, its citation's id, and its sources, among them a
// computed version's inputs, which name the content version they read.
const stored = (kind: string, citeId: string, sources: string[], inputs: string[] = []) => ({
    describes: { kind },
    cite: { id: citeId },
    sources: [
        ...sources.map((label) => ({ ref: `provenance/${label}`, label, publisher: 'OECD' })),
        ...inputs.map((label) => ({ ref: 'spec_1', label, content_version: 'cv_1' })),
    ],
});

test('sourceLine credits the first source, counts the rest once each, and DFO when it computed the card from none', () => {
    const computed = (sources: string[], inputs: string[], kind = 'computed_version') => ({
        ...info(inputs),
        description: stored(kind, 'ops_1', sources, inputs),
    });
    const cases: [CardInfo, SourceCredit | null][] = [
        [info(['World Bank IDS']), { lead: 'Source:', first: 'World Bank IDS', more: 0 }],
        [
            info(['World Bank IDS', 'World Bank IDS']),
            { lead: 'Source:', first: 'World Bank IDS', more: 0 },
        ],
        [
            info(['World Bank IDS', 'World Development Indicators']),
            { lead: 'Sources:', first: 'World Bank IDS', more: 1 },
        ],
        [
            info(['OECD CRS', 'World Bank IDS', 'World Development Indicators', 'IMF WEO']),
            { lead: 'Sources:', first: 'OECD CRS', more: 3 },
        ],
        // A described card credits its description's sources.
        [
            { ...info(['Old name']), description: stored('card_revision', 'spec_1', ['OECD CRS']) },
            { lead: 'Source:', first: 'OECD CRS', more: 0 },
        ],
        [{ ...info([]), description: stored('card_revision', 'spec_1', []) }, null],
        // A computed card credits its inputs' sources as any card credits its
        // own, else DFO's calculation, and never the inputs, which a card saved
        // before computed versions credited sources holds as its sources.
        [
            computed(['OECD CRS', 'World Bank WDI'], ['Gross ODA disbursements', 'GNI']),
            { lead: 'Sources:', first: 'OECD CRS', more: 1 },
        ],
        [
            computed([], ['Gross ODA disbursements', 'GNI']),
            { lead: 'Source: DFO calculation', first: null, more: 0 },
        ],
        // A card drawn from a computed version is computed too.
        [
            computed([], ['GNI'], 'card_revision'),
            { lead: 'Source: DFO calculation', first: null, more: 0 },
        ],
        // A card saved before its sources were kept names the one it held.
        [
            { ...info([], 'World Bank IDS'), sources: undefined },
            { lead: 'Source:', first: 'World Bank IDS', more: 0 },
        ],
        // A card saved with neither names what its attribution label names,
        // the count dropped.
        [
            { ...info([], null), sources: undefined },
            { lead: 'Source:', first: 'IDS; WDI', more: 0 },
        ],
        [
            { ...info([], null), sources: undefined, label: 'OECD DAC1 · 1 indicator' },
            { lead: 'Source:', first: 'OECD DAC1', more: 0 },
        ],
        [
            {
                ...info([], null),
                sources: undefined,
                label: 'WorldDevelopmentIndicators · 3000 indicator(s)',
            },
            { lead: 'Source:', first: 'WorldDevelopmentIndicators', more: 0 },
        ],
        [{ ...info([], null), label: 'Unknown source · 1 indicator(s)' }, null],
    ];

    assert.deepEqual(
        cases.map(([card]) => sourceLine(card)),
        cases.map(([, credit]) => credit),
    );
});
