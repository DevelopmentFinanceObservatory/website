import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    heightIsDerived,
    heightIsFree,
    heightRange,
    resolveCardView,
    SPAN_DEFAULT,
    SPAN_MAX,
    SPAN_MIN,
    spawnSpan,
    tableOf,
} from '../../../components/organisms/Studio/canvas/layout.ts';
import type { ChartWidget, KeyNumberWidget, TableWidget } from '../../chat/widgets.ts';
import { FITTED_ROWS_MAX } from '../chartFit.ts';
import { tableDisplay, tableRows, tableWidthCells } from '../tableFit.ts';

const table = (columns: string[], rows: string[][]): TableWidget => ({
    kind: 'table',
    id: 't',
    title: 'Aid to health',
    columns,
    rows,
});

const kenya = table(
    ['Country', '2022'],
    [
        ['Kenya', '5.10'],
        ['Uganda', '4.20'],
        ['Tanzania', '3.80'],
    ],
);

const chart: ChartWidget = {
    kind: 'chart',
    id: 'c',
    chartType: 'bar',
    title: 'Aid to health',
    unit: 'US$',
    categories: ['2020', '2021', '2022'],
    series: [{ label: 'Kenya', values: [1, 2, 3] }],
};

const stat: KeyNumberWidget = { kind: 'key_number', id: 'k', label: 'Aid', value: '5' };

test('every card but a stat card has a derived height, a table that cannot chart too', () => {
    const lone = table(['Country'], [['Kenya']]);

    assert.equal(resolveCardView(lone, undefined).view, null);
    assert.equal(heightIsDerived(lone, null), true);
    assert.equal(heightIsDerived(kenya, 'chart-table'), true);
    assert.equal(heightIsDerived(chart, 'chart-table'), true);
    assert.equal(heightIsDerived(stat, null), false);
});

test('the grip sets the height of a chart view at a ratio and of nothing else', () => {
    const ranking: ChartWidget = { ...chart, horizontal: true };

    assert.equal(heightIsFree('chart-bar', chart), true);
    assert.equal(heightIsFree('chart-line', chart), true);
    assert.equal(heightIsFree('chart-line', ranking), true);
    assert.equal(heightIsFree('chart-bar', ranking), false);
    assert.equal(heightIsFree('chart-table', chart), false);
    assert.equal(heightIsFree(null, null), false);
});

test('the height range follows the kind the card reads as', () => {
    const tableRange = { min: SPAN_MIN.table.h, max: FITTED_ROWS_MAX };
    const chartRange = { min: SPAN_MIN.chart.h, max: FITTED_ROWS_MAX };

    assert.ok(SPAN_MIN.table.h < SPAN_MIN.chart.h);
    assert.deepEqual(heightRange(chart, 'chart-table'), tableRange);
    assert.deepEqual(heightRange(kenya, null), tableRange);
    assert.deepEqual(heightRange(kenya, 'chart-bar'), chartRange);
    assert.deepEqual(heightRange(stat, null), {
        min: SPAN_MIN.key_number.h,
        max: SPAN_MAX.key_number.h,
    });
});

test('a fresh table spawns at its estimated width and rows', () => {
    const display = tableDisplay(kenya);
    const w = Math.max(tableWidthCells(display), SPAN_MIN.table.w);

    assert.deepEqual(spawnSpan(kenya, resolveCardView(kenya, undefined)), {
        w,
        h: tableRows({ widget: kenya, widthCells: w, display }),
    });
});

test('a fresh table spawns within the span limits, and an empty one at the default', () => {
    const wide = table(
        Array.from({ length: 12 }, (_, at) => `Column heading ${at}`),
        [Array.from({ length: 12 }, () => '1,234,567.89')],
    );
    const empty = table([], []);

    assert.equal(spawnSpan(wide, resolveCardView(wide, undefined)).w, SPAN_MAX.table.w);
    assert.deepEqual(spawnSpan(empty, resolveCardView(empty, undefined)), SPAN_DEFAULT.table);
});

test('a chart yields one table object across calls, and a table is its own', () => {
    assert.equal(tableOf(chart), tableOf(chart));
    assert.equal(tableOf(chart).series, true);
    assert.equal(tableOf(kenya), kenya);
});
