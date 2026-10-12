/**
 * `chartAlt.ts`: a chart says what it shows, and says at least its title
 * when there is nothing to read off it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { chartAlt } from '../chartAlt.ts';

import type { ChartWidget } from '@/lib/chat/widgets';

const chart = (over: Partial<ChartWidget> = {}): ChartWidget => ({
    kind: 'chart',
    id: 'card',
    chartType: 'line',
    title: 'Interest payments on external debt',
    categories: ['2000', '2001', '2002'],
    series: [{ label: 'Kenya', values: [10, 20, 30] }],
    ...over,
});

test('a chart reads as its kind, title, reach and series', () => {
    assert.equal(
        chartAlt(chart(), true),
        'Line chart. Interest payments on external debt. 2000 to 2002. Kenya: from 10 in 2000 to 30 in 2002.',
    );
});

test('several series are counted and each one read', () => {
    const alt = chartAlt(
        chart({
            series: [
                { label: 'Kenya', values: [10, 20, 30] },
                { label: 'Ghana', values: [5, null, 15] },
            ],
        }),
        false,
    );

    assert.match(alt, /^Bar chart\./);
    assert.match(alt, /2 series, 2000 to 2002/);
    assert.match(alt, /Kenya: 10 in 2000 to 30 in 2002/);
    assert.match(alt, /Ghana: 5 in 2000 to 15 in 2002/);
});

test('the window and unit come from the card info when it has them', () => {
    const alt = chartAlt(
        chart({
            info: {
                label: 'IDS · 1 indicator',
                sourceId: 'ids',
                sourceName: 'World Bank International Debt Statistics',
                sourceCount: 1,
                indicatorCount: 1,
                years: { start: '1970', end: '2024' },
                unit: 'US Dollar, millions',
                indicators: [],
                licence: null,
                dataThrough: null,
                lastRefreshed: null,
            },
        }),
        true,
    );

    assert.match(alt, /1970 to 2024, in us dollar, millions/);
    assert.match(alt, /Source: World Bank International Debt Statistics\.$/);
});

test('a long chart reads the first series and counts the rest', () => {
    const alt = chartAlt(
        chart({
            series: Array.from({ length: 12 }, (_, index) => ({
                label: `Series ${index}`,
                values: [index, index + 1, index + 2],
            })),
        }),
        true,
    );

    // "Series " is shared by every name, so it is said once in the title's
    // place and not twelve times over: the legend's own shortening.
    assert.match(alt, /\b7: 7 in 2000/);
    assert.doesNotMatch(alt, /\b8: 8 in 2000/);
    assert.match(alt, /And 4 more series\./);
});

test('a series at one period reads as a value, not a journey', () => {
    assert.match(
        chartAlt(chart({ series: [{ label: 'Kenya', values: [null, 20, null] }] }), false),
        /Kenya: 20 in 2001\.$/,
    );
});

test('a chart with no values falls back to its title', () => {
    assert.equal(
        chartAlt(chart({ series: [{ label: 'Kenya', values: [null, null, null] }] }), true),
        'Line chart. Interest payments on external debt.',
    );
});

test('a chart with no title at all still says what it is', () => {
    assert.equal(chartAlt(chart({ title: '', categories: [], series: [] }), false), 'Bar chart.');
});

test('long indicator names are shortened the way the legend shortens them', () => {
    const who = (category: string) =>
        `Health expenditure as a share of a reference expenditure aggregate [Health expenditure category=${category}, Reference expenditure category=Current health expenditure] / Kenya`;
    const alt = chartAlt(
        chart({
            series: [
                { label: who('Domestic general government'), values: [10, 20, 30] },
                { label: who('External'), values: [5, 10, 15] },
            ],
        }),
        true,
    );

    assert.match(alt, /Domestic general government: 10 in 2000 to 30 in 2002/);
    assert.doesNotMatch(alt, /reference expenditure aggregate/);
});

test('categories that are not periods are counted, not read as a range', () => {
    const alt = chartAlt(
        chart({
            categories: ['Health', 'Education', 'Defence'],
            series: [{ label: 'Value', values: [3, 2, 1] }],
        }),
        false,
    );

    assert.match(alt, /3 categories\./);
    assert.doesNotMatch(alt, /Value:/);
});
