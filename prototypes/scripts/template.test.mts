import assert from 'node:assert/strict';
import test from 'node:test';

import type { Row } from '@developmentfinance/client/types';

import { deriveSeries } from '../template/_lib/build.ts';

/** The parts of the read's dataset deriveSeries reads. */
const datasets = {
    series: { sentence: 'Sentence.', citation: { text: 'Citation.' } },
} as unknown as Parameters<typeof deriveSeries>[1];

const row = (year: number, value: Row['value']): Row => ({
    financingProvider: 'country/DEU',
    financingProvider_label: 'Germany',
    time_period: year,
    value,
});

test('the template leaves out rows whose value is not a finite number', () => {
    const series = deriveSeries(
        { series: [row(2021, 2), row(2020, 1), row(2022, null), row(2023, Number.NaN)] },
        datasets,
    );

    assert.deepEqual(series.points, [
        { year: 2020, value: 1 },
        { year: 2021, value: 2 },
    ]);
});

test('the template refuses rows with no value for its provider', () => {
    assert.throws(() => deriveSeries({ series: [row(2022, null)] }, datasets));
});
