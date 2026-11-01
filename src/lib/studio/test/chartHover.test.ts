/**
 * Tests for `chartHover.ts`, which picks the one series a chart's hover
 * names from the points of the hovered slot.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { largestFirst, nearestPoint, separatingAxis } from '../chartHover.ts';

test('bars are told apart across the slot, lines by their values', () => {
    assert.equal(separatingAxis(true, 'x'), 'x');
    assert.equal(separatingAxis(true, 'y'), 'y');
    assert.equal(separatingAxis(false, 'x'), 'y');
});

test('lines in a slot: the point nearest the pointer height wins', () => {
    // Three lines through one year, the pointer just under the middle one.
    const points = [
        { x: 100, y: 20, value: 40 },
        { x: 100, y: 60, value: 25 },
        { x: 100, y: 110, value: 3 },
    ];

    assert.equal(nearestPoint(points, { x: 104, y: 70 }, 'y'), 1);
    assert.equal(nearestPoint(points, { x: 96, y: 200 }, 'y'), 2);
});

test('grouped bars: the bar under the pointer wins, however short', () => {
    // A tall bar, then a short one whose top sits far below the pointer.
    const points = [
        { x: 90, y: 10, value: 50 },
        { x: 110, y: 190, value: 1 },
    ];

    assert.equal(nearestPoint(points, { x: 112, y: 15 }, 'x'), 1);
});

test('a point without a value is never named', () => {
    const points = [
        { x: 100, y: 60, value: null },
        { x: 100, y: 0, value: Number.NaN },
        { x: 100, y: 110, value: 3 },
    ];

    assert.equal(nearestPoint(points, { x: 100, y: 60 }, 'y'), 2);
    assert.equal(nearestPoint(points.slice(0, 2), { x: 100, y: 60 }, 'y'), null);
});

test('a single series names itself wherever the pointer is', () => {
    assert.equal(nearestPoint([{ x: 50, y: 80, value: 7 }], { x: 0, y: 0 }, 'y'), 0);
});

test('a tie goes to the first series', () => {
    const points = [
        { x: 100, y: 40, value: 10 },
        { x: 100, y: 80, value: 5 },
    ];

    assert.equal(nearestPoint(points, { x: 100, y: 60 }, 'y'), 0);
});

test('Shift lists the slot largest first, skipping series without a value', () => {
    assert.deepEqual(
        largestFirst([3, null, 40, undefined, 25, Number.NaN, -2, 25]),
        [2, 4, 7, 0, 6],
    );
    assert.deepEqual(largestFirst([null, undefined]), []);
});
