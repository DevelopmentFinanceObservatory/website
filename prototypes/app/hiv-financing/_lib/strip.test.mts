import assert from 'node:assert/strict';
import test from 'node:test';

import { COUNTRIES, country } from './fixture.mts';
import { buildStrip, dodge, median, perPersonPoints } from './strip.ts';

test('the strip holds countries with 50,000+ people living with HIV and some aid, ascending', () => {
    // Mexico has no 2024 aid, the Republic of the Congo has 40,000 people, and Ukraine has
    // no UNAIDS figure.
    assert.deepEqual(
        perPersonPoints(COUNTRIES).map(({ iso3, value }) => [iso3, Math.round(value)]),
        [
            ['COD', 18],
            ['KEN', 217],
            ['CIV', 450],
        ],
    );
    assert.deepEqual(
        perPersonPoints(COUNTRIES, 10_000).map(({ iso3 }) => iso3),
        ['COD', 'COG', 'KEN', 'CIV'],
    );

    // Under 5,000 people living with HIV the ratio is blank, whatever `min` is.
    const small = country({
        aid: { us: [0, 1e6], globalFund: [0, 0], other: [0, 0] },
        plhiv: 4_000,
    });

    assert.deepEqual(perPersonPoints([small], 1_000), []);
});

test('median is the standard median', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
});

test('buildStrip scales from $0 to the tick above the largest value, with the median', () => {
    const strip = buildStrip(COUNTRIES, 0.01);

    assert.deepEqual(strip.scale, { min: 0, max: 600, ticks: [0, 200, 400, 600] });
    assert.equal(strip.median, 304e6 / 1.4e6);
    assert.deepEqual(
        strip.dots.map(({ iso3, x, lane }) => [iso3, x, lane]),
        [
            ['COD', 18 / 600, 0],
            ['KEN', 304e6 / 1.4e6 / 600, 0],
            ['CIV', 0.75, 0],
        ],
    );
});

test('dodge stacks coincident dots in lanes 0, 1, −1, 2 regardless of input order', () => {
    const items = ['D', 'B', 'A', 'C'].map((id) => ({ id, x: 0.5 }));
    const lanes = dodge(items, 0.01);

    assert.deepEqual(Object.fromEntries(lanes), { A: 0, B: 1, C: -1, D: 2 });
    assert.deepEqual(dodge(items.toReversed(), 0.01), lanes);
});
