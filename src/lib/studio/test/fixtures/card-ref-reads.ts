/**
 * Component reads (`GET /api/presentation/components/{id}?revision=N`) for
 * the card reference match, one array per component with revision 1 first,
 * and cards in the shape Studio stored before `ref`: values in `csv`, no
 * `data`, `ref` or `frame`.
 */
import type { ComponentRead, StoredCard } from '../../cardRefMatch.ts';
import type { FactSummary } from '../../wire.ts';

export const FRAME = {
    spec_id: 'spec_209b19f3a7a50d137f034615f4695fe7',
    content_version: 'cv_bbd438aa1d8becf601443e1f4006d74c',
};

export const DERIVED_FRAME = {
    spec_id: 'ops_5d1c0a7e9b3f4c2d8e6a1b0f9c7d3e21',
    content_version: 'cv_0f1e2d3c4b5a69788796a5b4c3d2e1f0',
};

type Point = { period: string; value: number };

const factsOf = (
    id: string,
    revision: number,
    series: { label: string; first: number; last: number }[],
    window: { start: string; end: string },
): FactSummary => ({
    component_id: id,
    revision,
    series: series.map((one, index) => ({ id: `s_${index}`, point_count: 2, ...one })),
    indicators: [],
    attribution: { label: 'WHO · 1 indicator(s)', source_count: 1, indicator_count: 1 },
    window,
});

const readOf = (
    id: string,
    revision: number,
    component: Record<string, unknown> & { type: string; title: { text: string } },
    facts: FactSummary,
    frame = FRAME,
): ComponentRead => ({
    component_id: id,
    revision,
    catalog_version: '2026.8.0',
    stored_intent: { type: component.type, title: component.title.text, frame_ref: frame },
    fact_summary: facts,
    resolved_payload: {
        schema_version: 1,
        catalog_version: '2026.8.0',
        component_id: id,
        revision,
        provenance: { inputs: [frame], sources: [], warnings: [], citation: 'WHO via ONE DFO' },
        component,
    },
});

const CHART = 'cmp_01M3KK0ZXJ24DJFK401ZVTW7MG';

const chartRead = (revision: number, title: string, points: Point[]): ComponentRead =>
    readOf(
        CHART,
        revision,
        {
            type: 'line_chart',
            title: { text: title },
            series: [{ id: 'kenya', label: 'Kenya', unit: 'USD', points }],
        },
        factsOf(
            CHART,
            revision,
            [{ label: 'Kenya', first: points[0]!.value, last: points.at(-1)!.value }],
            { start: points[0]!.period, end: points.at(-1)!.period },
        ),
    );

const TWO_YEARS: Point[] = [
    { period: '2020', value: 81.5 },
    { period: '2021', value: 88.25 },
];
// Payload order is not period order: `csv` listed points by period.
const THREE_YEARS: Point[] = [{ period: '2022', value: 90.125 }, ...TWO_YEARS];

/** A line chart whose second revision adds a year and whose third only
 *  renames it. */
export const chartReads: ComponentRead[] = [
    chartRead(1, 'Health spending in Kenya', TWO_YEARS),
    chartRead(2, 'Health spending in Kenya', THREE_YEARS),
    chartRead(3, 'Health spending per person in Kenya', THREE_YEARS),
];

const TABLE = 'cmp_01M3KK0ZXJ24DJFK401ZVTW7MH';

const DONOR_ROWS = [
    { dimensions: { donor: 'Germany, Federal Republic' }, period: '2020', value: 35_123 },
    { dimensions: { donor: 'France' }, period: '2020', value: 15_907.5 },
];

const tableRead = (revision: number, rows: typeof DONOR_ROWS): ComponentRead =>
    readOf(
        TABLE,
        revision,
        {
            type: 'table',
            title: { text: 'ODA by donor' },
            columns: [
                { key: 'donor', label: 'Donor' },
                { key: 'period', label: 'Period' },
                { key: 'value', label: 'Value' },
            ],
            rows,
        },
        factsOf(
            TABLE,
            revision,
            rows.map((row) => ({ label: row.dimensions.donor, first: row.value, last: row.value })),
            { start: '2020', end: '2020' },
        ),
        DERIVED_FRAME,
    );

/** A table over a derived frame whose second revision only reorders its rows. */
export const tableReads: ComponentRead[] = [
    tableRead(1, DONOR_ROWS),
    tableRead(2, DONOR_ROWS.toReversed()),
];

const STAT = 'cmp_01M3KK0ZXJ24DJFK401ZVTW7MJ';

const statRead = (id: string, revision: number): ComponentRead =>
    readOf(
        id,
        revision,
        {
            type: 'stat_card',
            title: { text: 'Life expectancy in Nigeria' },
            label: 'Nigeria',
            value: 52.727,
            period: '2023',
            unit: 'Year',
        },
        factsOf(id, revision, [{ label: 'Nigeria', first: 37.207, last: 52.727 }], {
            start: '1960',
            end: '2023',
        }),
    );

/** A stat card with one revision. */
export const statReads: ComponentRead[] = [statRead(STAT, 1)];

const TWICE = 'cmp_01M3KK0ZXJ24DJFK401ZVTW7MK';

/** A stat card whose two revisions draw the same card. */
export const sameTwiceReads: ComponentRead[] = [statRead(TWICE, 1), statRead(TWICE, 2)];

export const reads: Record<string, ComponentRead[]> = {
    [CHART]: chartReads,
    [TABLE]: tableReads,
    [STAT]: statReads,
    [TWICE]: sameTwiceReads,
};

/** The chart as stored before `ref`, drawn from each of its revisions. */
export const csvCharts: StoredCard[] = [
    ['Health spending in Kenya', TWO_YEARS] as const,
    ['Health spending in Kenya', THREE_YEARS] as const,
    ['Health spending per person in Kenya', THREE_YEARS] as const,
].map(([title, points]) => {
    const byPeriod = points.toSorted((a, b) => a.period.localeCompare(b.period));

    return {
        kind: 'chart',
        id: CHART,
        chartType: 'line',
        title,
        categories: byPeriod.map((point) => point.period),
        series: [{ label: 'Kenya', values: byPeriod.map((point) => point.value) }],
        csv: [
            'series,period,value',
            ...byPeriod.map((point) => `Kenya,${point.period},${point.value}`),
        ].join('\n'),
        source: 'WHO · 1 indicator(s)',
    };
});

/** The table as stored before `ref`, drawn from its first revision. */
export const csvTable: StoredCard = {
    kind: 'table',
    id: TABLE,
    title: 'ODA by donor',
    columns: ['Donor', 'Period', 'Value'],
    rows: [
        ['Germany, Federal Republic', '2020', '35.1 K'],
        ['France', '2020', '15.9 K'],
    ],
    csv: 'Donor,Period,Value\n"Germany, Federal Republic",2020,35123\nFrance,2020,15907.5',
    source: 'WHO · 1 indicator(s)',
};

const csvStat = (id: string, csv: string): StoredCard => ({
    kind: 'key_number',
    id,
    label: 'Life expectancy in Nigeria',
    value: '52.73',
    csv,
    source: 'WHO · 1 indicator(s)',
});

const SKETCH_CSV = 'series,period,value\nNigeria,1960,37.207\nNigeria,2023,52.727';

/** A stat card as stored before `ref`: its `csv` is the fact summary's
 *  first and last value over the window. */
export const csvStatCard: StoredCard = csvStat(STAT, SKETCH_CSV);

/** The same card on the component whose two revisions draw alike. */
export const csvSameTwiceCard: StoredCard = csvStat(TWICE, SKETCH_CSV);

/** A stat card whose `csv` the statistics upgrade replaced. */
export const csvStatisticsCard: StoredCard = csvStat(
    STAT,
    'metric,period,value\nfirst,1960,37.207\nlatest,2023,52.727\nminimum,1960,37.207\nmaximum,2023,52.727',
);
