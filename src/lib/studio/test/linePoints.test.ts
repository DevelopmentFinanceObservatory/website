/**
 * Tests for `linePoints.ts`, which finds the points of a line that a segment
 * cannot draw.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { lonePoints } from '../linePoints.ts';

test('a line with no gaps has no lone points', () => {
    assert.deepEqual(lonePoints([1, 2, 3]), [false, false, false]);
});

test('every value of a line with gaps between all of them is lone', () => {
    assert.deepEqual(lonePoints([1, null, 2, null, 3]), [true, false, true, false, true]);
});

test('the ends count the far side as missing', () => {
    assert.deepEqual(lonePoints([1, null, 2, 3, null, 4]), [
        true,
        false,
        false,
        false,
        false,
        true,
    ]);
    assert.deepEqual(lonePoints([null, 1, 2]), [false, false, false]);
});

test('a single value is lone and a missing one is not', () => {
    assert.deepEqual(lonePoints([5]), [true]);
    assert.deepEqual(lonePoints([null]), [false]);
});

test('an empty series has no points', () => {
    assert.deepEqual(lonePoints([]), []);
});
