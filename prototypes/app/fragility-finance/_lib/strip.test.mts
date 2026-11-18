import assert from 'node:assert/strict';
import test from 'node:test';

import { context, flow, PROFILES } from './fixture.mts';
import { buildStrip, dodge, median, scalePosition, STRIPS, stripMedian } from './strip.ts';
import { groupContexts } from './scope.ts';

const RADIUS = 0.008;

const assertNoOverlap = (dots: readonly { x: number; lane: number }[], radius: number) => {
    for (const [i, a] of dots.entries()) {
        for (const b of dots.slice(i + 1)) {
            const distance = Math.hypot(a.x - b.x, (a.lane - b.lane) * 2 * radius);

            assert.ok(distance >= 2 * radius - 1e-12, `${a.x},${a.lane} and ${b.x},${b.lane}`);
        }
    }
};

test('dodge stacks coincident dots in lanes 0, 1, −1, 2 regardless of input order', () => {
    const items = ['D', 'B', 'A', 'C'].map((id) => ({ id, x: 0.5 }));
    const lanes = dodge(items, RADIUS);

    assert.deepEqual(Object.fromEntries(lanes), { A: 0, B: 1, C: -1, D: 2 });
    assert.deepEqual(dodge(items.toReversed(), RADIUS), lanes);
    assert.deepEqual(
        Object.fromEntries(
            dodge(
                [
                    { id: 'A', x: 0 },
                    { id: 'B', x: 0.5 },
                ],
                RADIUS,
            ),
        ),
        {
            A: 0,
            B: 0,
        },
    );
});

test('every strip over the 62 is deterministic and has no overlapping dots', () => {
    for (const key of Object.keys(STRIPS) as (keyof typeof STRIPS)[]) {
        for (const radius of [0.004, 0.008, 0.02]) {
            const strip = buildStrip(PROFILES, key, radius);

            assert.deepEqual(
                buildStrip(PROFILES.toReversed(), key, radius).dots.toSorted((a, b) =>
                    a.iso3.localeCompare(b.iso3),
                ),
                strip.dots.toSorted((a, b) => a.iso3.localeCompare(b.iso3)),
            );
            assertNoOverlap(strip.dots, radius);
            assert.equal(strip.dots.length + strip.missing.length, 62);
        }
    }
});

test('strips leave contexts without a value out and list them as missing', () => {
    const contexts = [
        context(),
        context({
            iso3: 'BBB',
            flows: [flow(2024, { remittances: null })],
            indicators: { stunting: null, water: null, dtp3: null },
        }),
    ];

    assert.deepEqual(buildStrip(contexts, 'odaShare', RADIUS).missing, ['BBB']);
    assert.deepEqual(
        buildStrip(contexts, 'stunting', RADIUS).dots.map((d) => [d.iso3, d.value, d.year]),
        [['AAA', 37, 2024]],
    );
    assert.deepEqual(stripMedian(contexts, 'water'), { value: null, count: 0 });
    assert.equal(buildStrip(PROFILES, 'odaShare', RADIUS).dots.length, 49);
});

test('the debt strip is logarithmic with $1 in the middle and clips the ends', () => {
    const { scale } = STRIPS.debtPerOda;

    assert.deepEqual(scalePosition(scale, 1), { x: 0.5, clipped: false });
    assert.deepEqual(scalePosition(scale, 0), { x: 0, clipped: true });
    assert.deepEqual(scalePosition(scale, 1000), { x: 1, clipped: true });
    assert.deepEqual(scalePosition(STRIPS.water.scale, 25), { x: 0.25, clipped: false });
});

test('the median follows the group while the dots stay put', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);

    const extreme = stripMedian(groupContexts(PROFILES, 'extreme'), 'stunting');
    const all = stripMedian(PROFILES, 'stunting');

    assert.equal(all.count, 61);
    assert.notEqual(extreme.value, all.value);
});
