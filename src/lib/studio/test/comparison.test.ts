/**
 * Bars over a single period are a comparison, not a time series: the series
 * become the categories, the card draws them horizontally in one colour, and
 * the period moves into the title. `widgetWithPoints` re-runs the same test
 * once the full rows arrive, so a chart can gain or lose the shape.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartWidget } from '../../chat/widgets.ts';
import { comparison } from '../comparison.ts';

const chart = (): ChartWidget => ({
    kind: 'chart',
    id: 'cmp_1',
    chartType: 'bar',
    title: 'Life expectancy in selected African countries',
    categories: [],
    series: [],
});

// The shape widgets.ts hands over once the rows are grouped: one entry per
// series, one value per period.
const entry = (label: string, ...values: (number | null)[]) => ({ label, values });

test('one period, several places: the places become the categories', () => {
    const entries = [entry('Kenya', 63.6), entry('Egypt', 71.6), entry('Ghana', 65.5)];
    const next = comparison(chart(), ['2023'], entries);

    assert.equal(next.horizontal, true);
    assert.deepEqual(next.categories, ['Kenya', 'Egypt', 'Ghana']);
    assert.equal(next.series.length, 1, 'one series means one colour');
    assert.deepEqual(next.series[0]!.values, [63.6, 71.6, 65.5]);
    assert.equal(next.series[0]!.label, '2023');
});

test('the period moves into the title, and is not repeated', () => {
    const entries = [entry('Kenya', 63.6), entry('Egypt', 71.6)];
    const titled: ChartWidget = { ...chart(), title: 'Life expectancy, 2023' };

    assert.equal(
        comparison(chart(), ['2023'], entries).title,
        'Life expectancy in selected African countries, 2023',
    );
    assert.equal(comparison(titled, ['2023'], entries).title, 'Life expectancy, 2023');
});

test('several periods stay a time series, read along the bottom', () => {
    const base: ChartWidget = { ...chart(), categories: ['2022', '2023'], series: [entry('Kenya', 62.9, 63.6)] };
    const next = comparison(base, ['2022', '2023'], base.series);

    assert.equal(next.horizontal, false, 'a redrawn chart loses the shape as readily as it gains it');
    assert.deepEqual(next.categories, ['2022', '2023']);
});

test('one period and one place is not a comparison', () => {
    const base: ChartWidget = { ...chart(), categories: ['2023'], series: [entry('Kenya', 63.6)] };

    assert.deepEqual(comparison(base, ['2023'], base.series).categories, ['2023']);
});

test('the platform may transpose it for us; then it only needs marking', () => {
    const already: ChartWidget = {
        ...chart(),
        categories: ['Kenya', 'Egypt'],
        series: [entry('2023', 63.6, 71.6)],
    };
    const next = comparison(already, already.categories, already.series, '2023');

    assert.equal(next.horizontal, true);
    assert.deepEqual(next.categories, ['Kenya', 'Egypt'], 'the plot is left as the payload drew it');
    assert.match(next.title, /, 2023$/);
});

test('a line chart is never transposed', () => {
    const entries = [entry('Kenya', 63.6), entry('Egypt', 71.6)];
    const line: ChartWidget = { ...chart(), chartType: 'line', categories: ['2023'], series: entries };

    assert.deepEqual(comparison(line, ['2023'], entries).categories, ['2023']);
});
