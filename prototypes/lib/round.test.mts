import assert from 'node:assert/strict';
import test from 'node:test';

import { pythonRound } from './round.ts';

test('pythonRound rounds an exact half to even, as Python round does', () => {
    // Python: round(0.5), round(1.5), round(2.5), round(87.25, 1), round(87.75, 1),
    // round(0.15, 1), round(2.675, 2), round(-2.5), round(1234.4999).
    const cases: [number, number, number][] = [
        [0.5, 0, 0],
        [1.5, 0, 2],
        [2.5, 0, 2],
        [87.25, 1, 87.2],
        [87.75, 1, 87.8],
        [0.15, 1, 0.1],
        [2.675, 2, 2.67],
        [-2.5, 0, -2],
        [1234.4999, 0, 1234],
    ];

    for (const [value, digits, expected] of cases) {
        assert.equal(pythonRound(value, digits), expected, `round(${value}, ${digits})`);
    }
});

test('pythonRound gives 0, not -0, for a small negative value', () => {
    // JSON.stringify(-0) is "0", so -0 would fail the build's round-trip check.
    for (const [value, digits] of [
        [-0.001, 2],
        [-0.4, 0],
        [-0.5, 0],
    ] as const) {
        assert.ok(Object.is(pythonRound(value, digits), 0), `round(${value}, ${digits})`);
    }
});
