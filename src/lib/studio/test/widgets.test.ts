/**
 * `widgets.ts` against resolved component payloads: a card draws the
 * component the platform resolved, carries the values it shows as `data`
 * and the revision it draws as `ref`, and its More Info cites every source.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    chartFromTable,
    type ChartWidget,
    formatAxis,
    type KeyNumberWidget,
    sourceLine,
    type TableWidget,
    type TextWidget,
} from '../../chat/widgets.ts';
import { keyNumberFace } from '../statFace.ts';
import { reviseWidget, widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated, ComponentType, FactSummary } from '../wire.ts';
import {
    composedUnit,
    envelopeComposedUnit,
    envelopeComposedUnitTable,
} from './fixtures/envelope-composed-unit.ts';
import { envelopeCreated, envelopeCreatedFrameProvenance } from './fixtures/envelope-created.ts';
import { oldCreated } from './fixtures/old-created.ts';

const SOURCE = 'src_oecd_crs_1a2b3c4d';

const facts: FactSummary = {
    component_id: 'cmp_test',
    revision: 1,
    series: [
        { id: 's_a', label: 'United States', point_count: 1, first: 60_000, last: 64_000 },
        { id: 's_b', label: 'Germany', point_count: 1, first: 30_000, last: 37_000 },
    ],
    indicators: [],
    attribution: { label: 'OECD CRS · 1 indicator(s)', source_count: 1, indicator_count: 1 },
    window: { start: '2015', end: '2023' },
};

const SERIES_COLUMNS = [
    { key: 'series', label: 'Series' },
    { key: 'period', label: 'Period' },
    { key: 'value', label: 'Value' },
    { key: 'unit', label: 'Unit' },
];

const frame = (type: ComponentType, payload: Record<string, unknown>): ComponentCreated => ({
    event: 'component.created',
    seq: 1,
    component_id: 'cmp_test',
    revision: 1,
    type,
    catalog_version: '2026.8.0',
    min_catalog_version: '2026.8.0',
    payload,
    fact_summary: facts,
    provenance: {
        inputs: [{ spec_id: 'ops_1a2b', content_version: 'ocv_3c4d' }],
        sources: [{ id: SOURCE, name: 'OECD CRS', licence: 'CC BY 4.0' }],
        freshness: { data_through: '2023', last_refreshed: '2026-09-01', partial_period: false },
        warnings: [],
        generated_at: '2026-10-03T00:00:00Z',
        citation: 'OECD CRS via ONE DFO',
    },
});

const envelope = (component: Record<string, unknown>) => ({
    schema_version: 1,
    catalog_version: '2026.8.0',
    component_id: 'cmp_test',
    revision: 1,
    provenance: { inputs: [{ spec_id: 'ops_1a2b', content_version: 'ocv_3c4d' }] },
    component,
});

const series = (label: string, points: Record<string, unknown>[]) => ({
    id: `s_${label.toLowerCase().replace(/\W/g, '')}`,
    label,
    unit: 'USD',
    source_ref: SOURCE,
    points,
});

const title = { text: 'Top 10 donors', authorship: 'model' };
const range = { min: null, max: null };

const asChart = (widget: unknown): ChartWidget => {
    assert.equal((widget as ChartWidget | null)?.kind, 'chart');

    return widget as ChartWidget;
};

const asTable = (widget: unknown): TableWidget => {
    assert.equal((widget as TableWidget | null)?.kind, 'table');

    return widget as TableWidget;
};

const asStat = (widget: unknown): KeyNumberWidget => {
    assert.equal((widget as KeyNumberWidget | null)?.kind, 'key_number');

    return widget as KeyNumberWidget;
};

const revisedFrame = (revision: number, payload?: Record<string, unknown> | null) => ({
    event: 'component.revised' as const,
    seq: revision,
    component_id: 'cmp_test',
    revision,
    changed: ['title'],
    fact_summary: facts,
    payload,
});

// Ranked by value, which is neither alphabetical nor id order.
const DONORS: [string, number][] = [
    ['United States', 64_000],
    ['Germany', 37_000],
    ['EU Institutions', 26_000],
    ['United Kingdom', 15_000],
    ['Japan', 19_000],
    ['France', 15_500],
    ['Canada', 6_000],
    ['Netherlands', 6_500],
    ['Sweden', 5_600],
    ['Italy', 6_200],
];

const entityBarChart = envelope({
    type: 'bar_chart',
    title,
    series: DONORS.map(([label, value]) => series(label, [{ period: '2023', value }])),
    category_axis: { mode: 'entity', category_dimension: 'donor', period: '2023' },
    value_axis: { label: 'ODA disbursements', scale: 'linear', range },
});

test('entity-mode bar chart: one bar per series, labelled, in payload order', () => {
    const widget = asChart(widgetFromComponent(frame('bar_chart', entityBarChart)));

    assert.equal(widget.chartType, 'bar');
    assert.deepEqual(
        widget.categories,
        DONORS.map(([label]) => label),
    );
    assert.deepEqual(widget.series, [{ label: '2023', values: DONORS.map(([, value]) => value) }]);
});

test('span period: an entity bar, a table and a stat card read 2018–2022, their data keeps 2018/2022', () => {
    const span = '2018/2022';
    const bar = asChart(
        widgetFromComponent(
            frame(
                'bar_chart',
                envelope({
                    type: 'bar_chart',
                    title,
                    series: [series('Germany', [{ period: span, value: 37_000 }])],
                    category_axis: { mode: 'entity', category_dimension: 'donor', period: span },
                    value_axis: { label: 'ODA disbursements', scale: 'linear', range },
                }),
            ),
        ),
    );

    assert.deepEqual(bar.series, [{ label: '2018–2022', values: [37_000] }]);
    assert.deepEqual(bar.data?.rows, [['Germany', span, 37_000, 'USD']]);

    const table = asTable(
        widgetFromComponent(
            frame(
                'table',
                envelope({
                    type: 'table',
                    title,
                    columns: [
                        { key: 'donor', label: 'Donor' },
                        { key: 'period', label: 'Period' },
                        { key: 'value', label: 'Value' },
                    ],
                    rows: [
                        {
                            series_id: 's_x',
                            dimensions: { donor: 'Germany' },
                            period: span,
                            source_ref: SOURCE,
                            unit: 'USD',
                            value: 37_000,
                        },
                    ],
                }),
            ),
        ),
    );

    assert.deepEqual(table.rows, [['Germany', '2018–2022', '37.0 K']]);
    assert.equal(table.data?.rows[0]?.[1], span);

    const stat = asStat(
        widgetFromComponent(
            frame(
                'stat_card',
                envelope({
                    type: 'stat_card',
                    title,
                    value: 37_000,
                    label: 'Germany',
                    period: span,
                }),
            ),
        ),
    );

    assert.equal(keyNumberFace(stat).caption, '2018–2022');
    assert.equal(stat.data?.rows[0]?.[1], span);
});

test('period-mode bar chart: one series across its periods, a status point left empty', () => {
    const payload = envelope({
        type: 'bar_chart',
        title,
        series: [
            series('United States', [
                { period: '2021', value: 47_800 },
                { period: '2022', status: 'missing' },
                { period: '2023', value: 64_000 },
            ]),
        ],
        category_axis: { mode: 'period', window: { start: '2021', end: '2023' } },
        value_axis: { label: 'ODA disbursements', scale: 'linear', range },
    });
    const widget = asChart(widgetFromComponent(frame('bar_chart', payload)));

    assert.deepEqual(widget.categories, ['2021', '2022', '2023']);
    assert.deepEqual(widget.series, [{ label: 'United States', values: [47_800, null, 64_000] }]);
});

test('multi-series line chart: every series across the union of its periods', () => {
    const payload = envelope({
        type: 'line_chart',
        title,
        series: [
            series('United States', [
                { period: '2021', value: 47_800 },
                { period: '2022', value: 60_500 },
            ]),
            series('Germany', [
                { period: '2022', value: 35_000 },
                { period: '2023', value: 37_000 },
            ]),
        ],
        x_axis: { window: { start: '2021', end: '2023' } },
        y_axis: { label: 'ODA disbursements', scale: 'linear', range },
    });
    const widget = asChart(widgetFromComponent(frame('line_chart', payload)));

    assert.equal(widget.chartType, 'line');
    assert.deepEqual(widget.categories, ['2021', '2022', '2023']);
    assert.deepEqual(widget.series, [
        { label: 'United States', values: [47_800, 60_500, null] },
        { label: 'Germany', values: [null, 35_000, 37_000] },
    ]);
});

test('table: the payload columns and rows, a status cell named by its status', () => {
    const row = (donor: string, period: string, point: Record<string, unknown>) => ({
        series_id: 's_x',
        dimensions: { donor, stat_var: 'ODA disbursements' },
        period,
        source_ref: SOURCE,
        unit: 'USD',
        ...point,
    });
    const payload = envelope({
        type: 'table',
        title,
        columns: [
            { key: 'donor', label: 'Donor' },
            { key: 'period', label: 'Period' },
            { key: 'value', label: 'Value' },
        ],
        rows: [
            row('Germany', '2022', { value: 35_000 }),
            row('Germany', '2023', { status: 'suppressed' }),
            row('Japan', '2022', { status: 'not_applicable' }),
            row('Japan', '2023', { value: 19_000 }),
            row('Japan', '2024', {}),
        ],
    });
    const widget = asTable(widgetFromComponent(frame('table', payload)));

    assert.deepEqual(widget.columns, ['Donor', 'Period', 'Value']);
    assert.deepEqual(widget.rows, [
        ['Germany', '2022', '35.0 K'],
        ['Germany', '2023', 'Suppressed'],
        ['Japan', '2022', 'Not applicable'],
        ['Japan', '2023', '19.0 K'],
        ['Japan', '2024', '—'],
    ]);
});

test('data: an entity-mode bar chart has one row per bar, ref names the revision and frame its frame', () => {
    const drawn = asChart(widgetFromComponent(frame('bar_chart', entityBarChart)));

    assert.deepEqual(drawn.ref, { component_id: 'cmp_test', revision: 1 });
    assert.deepEqual(drawn.data, {
        columns: SERIES_COLUMNS,
        rows: DONORS.map(([label, value]) => [label, '2023', value, 'USD']),
    });
    assert.deepEqual(drawn.frame, { spec_id: 'ops_1a2b', content_version: 'ocv_3c4d' });
});

test('data: a line chart has every valued point, a status point left out', () => {
    const periods = Array.from({ length: 10 }, (_, index) => String(2014 + index));
    const payload = envelope({
        type: 'line_chart',
        title,
        series: ['United States', 'Germany'].map((label) =>
            series(label, [
                ...periods.map((period, index) => ({ period, value: 1_000 * (index + 1) })),
                { period: '2024', status: 'missing' },
            ]),
        ),
        x_axis: { window: { start: '2014', end: '2024' } },
        y_axis: { label: 'ODA disbursements', scale: 'linear', range },
    });
    const rows = asChart(widgetFromComponent(frame('line_chart', payload))).data?.rows;

    assert.equal(rows?.length, 2 * 10);
    assert.equal(rows?.filter((row) => row[0] === 'Germany').length, 10);
    assert.deepEqual(rows?.[0], ['United States', '2014', 1_000, 'USD']);
});

test('data: a table has its payload rows unrounded, and a revision rebuilds them', () => {
    const rows = (values: number[]) =>
        values.map((value, index) => ({
            series_id: 's_x',
            dimensions: { donor: 'Germany, "Federal" Republic' },
            period: String(2020 + index),
            source_ref: SOURCE,
            unit: 'USD',
            value,
        }));
    const columns = [
        { key: 'donor', label: 'Donor' },
        { key: 'period', label: 'Period' },
        { key: 'value', label: 'Value' },
    ];
    const tableOf = (values: number[]) =>
        envelope({ type: 'table', title, columns, rows: rows(values) });
    const drawn = asTable(widgetFromComponent(frame('table', tableOf([35_123, 37_456]))));

    assert.deepEqual(drawn.data, {
        columns: [...columns, { key: 'unit', label: 'Unit' }],
        rows: [
            ['Germany, "Federal" Republic', '2020', 35_123, 'USD'],
            ['Germany, "Federal" Republic', '2021', 37_456, 'USD'],
        ],
    });

    const revised = asTable(reviseWidget(drawn, { ...revisedFrame(2), payload: tableOf([1]) }));

    assert.deepEqual(revised.data?.rows, [['Germany, "Federal" Republic', '2020', 1, 'USD']]);
    assert.deepEqual(revised.ref, { component_id: 'cmp_test', revision: 2 });
});

const eurosPerPerson = {
    numerator: { currency: 'EUR', prices: 'constant', base_year: 2020 },
    denominator: { stat_var: 'dcid:Count_Person', label: 'Total population' },
};

test("a table names each row's unit when units mix, and charts with it when the unit is constant", () => {
    const columns = [
        { key: 'stat_var', label: 'Indicator' },
        { key: 'period', label: 'Period' },
        { key: 'value', label: 'Value' },
    ];
    const row = (statVar: string, unit: unknown) => ({
        series_id: 's_x',
        dimensions: { stat_var: statVar },
        period: '2023',
        source_ref: SOURCE,
        unit,
        value: 5,
    });
    const tableOf = (rows: unknown[]) => envelope({ type: 'table', title, columns, rows });
    const dollars = { currency: 'USD', magnitude: 'millions', prices: 'constant', base_year: 2023 };
    const mixed = asTable(
        widgetFromComponent(
            frame(
                'table',
                tableOf([
                    row('ODA', dollars),
                    row('Share of GNI', 'percent'),
                    row('ODA per person', composedUnit),
                    row('ODA per person, euros', eurosPerPerson),
                    row('Unreadable', { numerator: 'USDollar' }),
                ]),
            ),
        ),
    );
    const unitTexts = [
        'USD millions (constant 2023)',
        'percent',
        'US Dollar per Total population',
        'Euro (constant 2020 prices) per Total population',
    ];

    assert.deepEqual(
        mixed.data?.rows.map((cells) => cells.at(-1)),
        [...unitTexts, null],
    );
    assert.deepEqual(mixed.columns, ['Indicator', 'Period', 'Unit', 'Value']);
    assert.deepEqual(mixed.rows, [
        ['ODA', '2023', 'USD millions (constant 2023)', '5'],
        ['Share of GNI', '2023', 'percent', '5'],
        ['ODA per person', '2023', 'US Dollar per Total population', '5'],
        ['ODA per person, euros', '2023', 'Euro (constant 2020 prices) per Total population', '5'],
        ['Unreadable', '2023', '—', '5'],
    ]);

    const constant = asTable(
        widgetFromComponent(frame('table', tableOf([row('ODA', 'USD'), row('Grants', 'USD')]))),
    );

    assert.deepEqual(constant.columns, ['Indicator', 'Period', 'Value']);
    assert.equal(chartFromTable(constant)?.unit, 'USD');

    const perPerson = asTable(
        widgetFromComponent(
            frame('table', tableOf([row('ODA', composedUnit), row('Grants', composedUnit)])),
        ),
    );

    assert.deepEqual(perPerson.columns, ['Indicator', 'Period', 'Value']);
    assert.equal(chartFromTable(perPerson)?.unit, 'US Dollar per Total population');

    const inMillions = {
        numerator: { currency: 'EUR', magnitude: 'millions', prices: null, base_year: null },
        denominator: composedUnit.denominator,
    };
    const scaled = asTable(
        widgetFromComponent(
            frame('table', tableOf([row('ODA', inMillions), row('Grants', inMillions)])),
        ),
    );

    assert.equal(chartFromTable(scaled)?.unit, 'Euro (millions) per Total population');
});

// A stat card and its fact summary carry the same unit.
const statWithUnit = (unit: unknown, payload: Record<string, unknown> = statCard({ unit })) => {
    const created = frame('stat_card', payload);

    return asStat(
        widgetFromComponent({
            ...created,
            fact_summary: { ...facts, unit: unit as FactSummary['unit'] },
        }),
    );
};

test('stat card: a composed unit reads on the face, in the data and in More Info', () => {
    const widget = statWithUnit(composedUnit, envelopeComposedUnit);

    assert.equal(widget.unit, 'US Dollar per Total population');
    assert.deepEqual(keyNumberFace(widget), {
        amount: '3.34',
        suffix: '',
        caption: 'US Dollar per Total population · 2024',
    });
    assert.deepEqual(widget.data?.rows, [
        [
            'Malaria grant disbursements to Ethiopia per person',
            '2024',
            3.34,
            'US Dollar per Total population',
        ],
    ]);
    assert.equal(widget.info?.unit, 'US Dollar per Total population');

    const euros = statWithUnit(eurosPerPerson);

    assert.equal(
        keyNumberFace(euros).caption,
        'Euro (constant 2020 prices) per Total population · 2024 · +1.9% from 2023',
    );
    assert.equal(euros.data?.rows[0]?.at(-1), 'Euro (constant 2020 prices) per Total population');
    assert.equal(euros.info?.unit, 'Euro (constant 2020 prices) per Total population');
});

// What a stat card shows that depends on its unit.
const statView = (widget: KeyNumberWidget) => ({
    value: widget.value,
    unit: widget.unit,
    stat: widget.stat,
    face: keyNumberFace(widget),
    data: widget.data,
    info: widget.info?.unit,
});

// A revision takes the unit of its own frame: each view matches a card created
// with that unit.
test('stat card: a revision to another unit reads as a card created with it', () => {
    for (const [from, to] of [
        [undefined, eurosPerPerson],
        [eurosPerPerson, composedUnit],
        [composedUnit, 'USD'],
        [composedUnit, null],
    ]) {
        const drawn = statWithUnit(from);
        const revised = asStat(
            reviseWidget(drawn, {
                ...revisedFrame(2, {
                    ...statCard({ unit: to }),
                    provenance: envelopeCreated.provenance,
                }),
                fact_summary: { ...facts, unit: to as FactSummary['unit'] },
            }),
        );

        assert.deepEqual(statView(revised), statView(statWithUnit(to)));

        // Without provenance in the payload the panel keeps what it held and
        // still names the revised unit.
        const bare = asStat(
            reviseWidget(drawn, {
                ...revisedFrame(2, statCard({ unit: to })),
                fact_summary: { ...facts, unit: to as FactSummary['unit'] },
            }),
        );

        assert.equal(bare.info?.unit, statWithUnit(to).info?.unit);
        assert.deepEqual({ ...bare.info, unit: null }, { ...drawn.info, unit: null });
    }
});

test('table: a revision to another unit reads as a table created with it', () => {
    const tableWith = (unit: unknown) => ({
        ...envelopeComposedUnitTable,
        component: {
            ...envelopeComposedUnitTable.component,
            rows: envelopeComposedUnitTable.component.rows.map((row) => ({ ...row, unit })),
        },
    });
    const view = (widget: TableWidget) => ({
        columns: widget.columns,
        rows: widget.rows,
        data: widget.data,
        info: widget.info?.unit,
    });
    const created = (payload: Record<string, unknown>, unit: unknown) =>
        asTable(
            widgetFromComponent({
                ...frame('table', payload),
                fact_summary: { ...facts, unit: unit as FactSummary['unit'] },
            }),
        );

    for (const [from, to] of [
        ['USD', composedUnit],
        [composedUnit, eurosPerPerson],
        [eurosPerPerson, 'USD'],
    ]) {
        const revised = asTable(
            reviseWidget(created(tableWith(from), from), {
                ...revisedFrame(2, tableWith(to)),
                fact_summary: { ...facts, unit: to as FactSummary['unit'] },
            }),
        );

        assert.deepEqual(view(revised), view(created(tableWith(to), to)));

        const bare = asTable(
            reviseWidget(created(tableWith(from), from), {
                ...revisedFrame(2, { ...tableWith(to), provenance: null }),
                fact_summary: { ...facts, unit: to as FactSummary['unit'] },
            }),
        );

        assert.equal(bare.info?.unit, created(tableWith(to), to).info?.unit);
    }

    // The catalogue's own table fixture.
    const fixture = created(envelopeComposedUnitTable, composedUnit);

    assert.equal(
        fixture.data?.rows[0]?.at(-1),
        'US Dollar (constant 2023 prices) per Total population',
    );
});

const INFO_UNITS: [string, unknown, string | null][] = [
    ['a label', 'USDollar', 'US Dollar'],
    [
        'a structured unit',
        { currency: 'USD', magnitude: 'millions', prices: 'constant', base_year: 2023 },
        'US Dollar, millions, constant 2023 prices',
    ],
    ['a malformed composed unit', { numerator: 'USDollar', denominator: null }, null],
    ['none', null, null],
];

for (const [name, unit, expected] of INFO_UNITS) {
    test(`More Info: the fact summary's unit, ${name}`, () => {
        assert.equal(statWithUnit(unit).info?.unit, expected);
    });
}

const statCard = (component: Record<string, unknown> = {}) =>
    envelope({
        type: 'stat_card',
        title: { text: 'Malaria grants to Ethiopia', authorship: 'model' },
        value: 441.9,
        label: 'Malaria grant disbursements to Ethiopia',
        period: '2024',
        unit: { currency: 'USD', magnitude: 'millions', prices: 'constant', base_year: 2023 },
        change: { derivation: 'percent_change', basis: ['2023', '2024'], value: 1.89 },
        ...component,
    });

test('stat card: value, unit, period and change come from the payload', () => {
    const widget = asStat(widgetFromComponent(frame('stat_card', statCard())));

    assert.equal(widget.label, 'Malaria grants to Ethiopia');
    assert.equal(widget.value, '441.9M');
    assert.equal(widget.unit, 'US Dollar');
    assert.deepEqual(keyNumberFace(widget), {
        amount: '441.9M',
        suffix: '',
        caption: 'US Dollar · constant 2023 prices · 2024 · +1.9% from 2023',
    });
    assert.deepEqual(widget.ref, { component_id: 'cmp_test', revision: 1 });
    assert.deepEqual(widget.data, {
        columns: SERIES_COLUMNS,
        rows: [
            [
                'Malaria grant disbursements to Ethiopia',
                '2024',
                441.9,
                'USD millions (constant 2023)',
            ],
        ],
    });
});

test('stat card: a difference change, and a card that asked for none', () => {
    const difference = asStat(
        widgetFromComponent(
            frame(
                'stat_card',
                statCard({
                    value: 1_250_000,
                    unit: 'Person',
                    change: { derivation: 'difference', basis: ['2020', '2024'], value: -40_000 },
                }),
            ),
        ),
    );

    assert.deepEqual(
        [difference.value, difference.unit, keyNumberFace(difference).caption],
        ['1.3M', 'Person', 'Person · 2024 · −40.0K from 2020'],
    );

    const plain = asStat(widgetFromComponent(frame('stat_card', statCard({ change: undefined }))));

    assert.equal(keyNumberFace(plain).caption, 'US Dollar · constant 2023 prices · 2024');
});

test('stat card: the older payload falls back to the fact summary headline', () => {
    const widget = asStat(widgetFromComponent(frame('stat_card', oldCreated)));

    assert.equal(widget.value, '64.0K');
    assert.deepEqual(keyNumberFace(widget), { amount: '64.0K', suffix: '', caption: '' });
});

test('a payload without a resolved component draws the fact-summary sketch', () => {
    const widget = asChart(widgetFromComponent(frame('line_chart', oldCreated)));

    assert.deepEqual(widget.categories, ['2015', '2023']);
    assert.deepEqual(widget.series, [
        { label: 'United States', values: [60_000, 64_000] },
        { label: 'Germany', values: [30_000, 37_000] },
    ]);
    assert.deepEqual(widget.data?.rows, [
        ['United States', '2015', 60_000, null],
        ['United States', '2023', 64_000, null],
        ['Germany', '2015', 30_000, null],
        ['Germany', '2023', 37_000, null],
    ]);
});

test('a revision redraws from its payload', () => {
    const drawn = asChart(widgetFromComponent(frame('bar_chart', entityBarChart)));
    const narrowed = envelope({
        ...entityBarChart.component,
        title: { text: 'Top 3 donors', authorship: 'model' },
        series: DONORS.slice(0, 3).map(([label, value]) =>
            series(label, [{ period: '2023', value }]),
        ),
    });
    const revised = asChart(reviseWidget(drawn, revisedFrame(2, narrowed)));

    // A comparison names its period in the title: the axis carries the
    // places, so the moment has nowhere else to go (see studio/comparison).
    assert.equal(revised.title, 'Top 3 donors, 2023');
    assert.equal(revised.horizontal, true);
    assert.deepEqual(revised.categories, ['United States', 'Germany', 'EU Institutions']);
    assert.deepEqual(revised.series, [{ label: '2023', values: [64_000, 37_000, 26_000] }]);
    assert.equal(revised.data?.rows.length, 3);
    assert.deepEqual(revised.ref, { component_id: 'cmp_test', revision: 2 });
});

test('a revised chart takes its unit from the revised frame', () => {
    const drawn = asChart(
        widgetFromComponent({
            ...frame('bar_chart', entityBarChart),
            fact_summary: { ...facts, unit: 'USD' },
        }),
    );

    assert.equal(drawn.unit, 'USD');

    const revised = asChart(
        reviseWidget(drawn, {
            ...revisedFrame(2, entityBarChart),
            fact_summary: { ...facts, unit: eurosPerPerson as FactSummary['unit'] },
        }),
    );

    assert.equal(revised.unit, 'Euro (constant 2020 prices) per Total population');
});

test('a revision without a payload keeps the title, drawing, values and ref it holds', () => {
    const drawn = asChart(widgetFromComponent(frame('bar_chart', entityBarChart)));
    // A fact summary whose first series label would read as a title.
    const renamed = { ...facts, series: [{ ...facts.series[0]!, label: 'Germany' }] };

    for (const payload of [null, undefined]) {
        const kept = reviseWidget(drawn, { ...revisedFrame(2, payload), fact_summary: renamed });

        assert.equal(kept, drawn);
    }

    const stat = asStat(widgetFromComponent(frame('stat_card', statCard())));

    assert.equal(reviseWidget(stat, revisedFrame(2, null)), stat);
});

test('a revised stat card takes its new value and change from the payload', () => {
    const stat = asStat(widgetFromComponent(frame('stat_card', statCard())));
    const revised = asStat(
        reviseWidget(
            stat,
            revisedFrame(
                2,
                statCard({
                    period: '2023',
                    value: 433.7,
                    change: { derivation: 'percent_change', basis: ['2022', '2023'], value: -2 },
                }),
            ),
        ),
    );

    assert.deepEqual(
        [revised.value, keyNumberFace(revised).caption],
        ['433.7M', 'US Dollar · constant 2023 prices · 2023 · −2% from 2022'],
    );
    assert.deepEqual(revised.data?.rows[0]?.slice(1, 3), ['2023', 433.7]);
    assert.deepEqual(revised.ref, { component_id: 'cmp_test', revision: 2 });
});

test('More Info: the citation and every source, licence normalised', () => {
    const created = frame('line_chart', entityBarChart);

    created.provenance.sources = [
        { id: SOURCE, name: 'OECD CRS', licence: 'CC BY 4.0', url: 'https://oecd.org/crs' },
        { id: 'src_wdi', name: 'World Bank WDI', licence: 'Not stated', retrieved: '2026-09-28' },
        { id: 'src_dc', name: 'dc/base/X', licence: 'unknown', url: '' },
    ];

    const { info } = asChart(widgetFromComponent(created));

    assert.equal(info?.citation, 'OECD CRS via ONE DFO');
    assert.deepEqual(info?.sources, [
        {
            id: SOURCE,
            name: 'OECD CRS',
            licence: 'CC BY 4.0',
            url: 'https://oecd.org/crs',
            retrieved: null,
        },
        {
            id: 'src_wdi',
            name: 'World Bank WDI',
            licence: null,
            url: null,
            retrieved: '2026-09-28',
        },
        { id: 'src_dc', name: 'dc/base/X', licence: null, url: null, retrieved: null },
    ]);
    assert.deepEqual([info?.sourceId, info?.licence], [SOURCE, 'CC BY 4.0']);
    assert.equal(sourceLine(info!), 'OECD CRS; World Bank WDI; dc/base/X');
});

test('a share card: its Percent unit puts "%" on the value axis, and it names both sources', () => {
    const created = {
        ...frame('line_chart', entityBarChart),
        fact_summary: {
            ...facts,
            unit: 'Percent',
            attribution: {
                label: 'World Bank IDS; World Development Indicators · 1 indicator(s)',
                source_count: 2,
                indicator_count: 1,
            },
        },
    };

    created.provenance.sources = [
        { id: 'provenance/WorldBankInternationalDebtStatistics', name: 'World Bank IDS' },
        { id: 'dc/base/WorldDevelopmentIndicators', name: 'World Development Indicators' },
    ].map((source) => ({ ...source, licence: 'CC BY 4.0' }));

    const chart = asChart(widgetFromComponent(created));

    assert.equal(formatAxis(5.333, chart.unit), '5.33%');
    assert.equal(sourceLine(chart.info!), 'World Bank IDS; World Development Indicators');
});

const CRS_DCID = 'dc/base/OECD_CRS';

// The platform's provenance names each source by a minted `src_` id and the
// graph dcid as `ref`; the harness's names it by the dcid alone.
const platformProvenance = {
    inputs: [{ spec_id: 'ops_1a2b', content_version: 'ocv_3c4d' }],
    sources: [
        {
            id: SOURCE,
            ref: CRS_DCID,
            name: 'OECD CRS',
            licence: 'OECD Terms and Conditions',
            url: 'https://oecd.org/crs',
        },
    ],
    freshness: { data_through: '2024', last_refreshed: '2026-10-01' },
    citation: 'OECD CRS, platform citation',
};

const harnessSources = [{ id: CRS_DCID, name: 'OECD_CRS', licence: 'not stated by the platform' }];

test('More Info: a created card reads the payload provenance when its sources carry a ref', () => {
    const created = frame('bar_chart', { ...entityBarChart, provenance: platformProvenance });

    created.provenance.sources = harnessSources;

    const { info } = asChart(widgetFromComponent(created));

    assert.equal(info?.citation, 'OECD CRS, platform citation');
    assert.deepEqual(
        [info?.sourceId, info?.licence, info?.dataThrough, info?.lastRefreshed],
        [CRS_DCID, 'OECD Terms and Conditions', '2024', '2026-10-01'],
    );
    assert.deepEqual(
        info?.sources?.map((source) => [source.id, source.licence, source.url]),
        [[CRS_DCID, 'OECD Terms and Conditions', 'https://oecd.org/crs']],
    );
});

test('More Info: a source card lists the payload provenance sources with their licence', () => {
    const created = frame('source_card', {
        ...envelope({ type: 'source_card' }),
        provenance: platformProvenance,
    });

    created.provenance.sources = harnessSources;

    assert.equal(
        (widgetFromComponent(created) as TextWidget).body,
        'OECD CRS (OECD Terms and Conditions)',
    );
});

// The recorded WDI card: payload sources without a ref, null payload freshness.
const recordedCreated = (payloadProvenance: Record<string, unknown>): ComponentCreated => ({
    ...frame('line_chart', { ...envelopeCreated, provenance: payloadProvenance }),
    provenance: envelopeCreatedFrameProvenance,
});

test('More Info: payload sources without a ref keep the frame provenance and its dcids', () => {
    const { info } = asChart(widgetFromComponent(recordedCreated(envelopeCreated.provenance)));

    assert.equal(info?.citation, 'WorldDevelopmentIndicators');
    assert.deepEqual(
        info?.sources?.map((source) => [source.id, source.name]),
        [['dc/base/WorldDevelopmentIndicators', 'WorldDevelopmentIndicators']],
    );
    assert.deepEqual([info?.dataThrough, info?.lastRefreshed], ['2023', '2026-09-28']);
});

test("More Info: a payload provenance with null freshness keeps the frame's freshness", () => {
    const [source] = envelopeCreated.provenance.sources;
    const { info } = asChart(
        widgetFromComponent(
            recordedCreated({
                ...envelopeCreated.provenance,
                sources: [{ ...source, ref: 'dc/base/WorldDevelopmentIndicators' }],
            }),
        ),
    );

    assert.equal(info?.citation, envelopeCreated.provenance.citation);
    assert.deepEqual(
        info?.sources?.map((source) => [source.id, source.name]),
        [['dc/base/WorldDevelopmentIndicators', 'dc/base/WorldDevelopmentIndicators']],
    );
    assert.deepEqual([info?.dataThrough, info?.lastRefreshed], ['2023', '2026-09-28']);
});

test('More Info: a revised payload brings its own citation and sources', () => {
    const drawn = asChart(widgetFromComponent(frame('bar_chart', entityBarChart)));
    const revised = asChart(
        reviseWidget(
            drawn,
            revisedFrame(2, { ...entityBarChart, provenance: envelopeCreated.provenance }),
        ),
    );

    assert.equal(revised.info?.citation, envelopeCreated.provenance.citation);
    assert.deepEqual(
        revised.info?.sources?.map((source) => [source.id, source.licence, source.url]),
        [['src_dc_base_worlddevelopmentindicators_9957fdf7', null, null]],
    );
});
