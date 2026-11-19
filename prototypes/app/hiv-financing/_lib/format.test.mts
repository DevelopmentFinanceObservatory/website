import assert from 'node:assert/strict';
import test from 'node:test';

import { axisMoney, deathCount, listOf, money, people, peopleShort, pct } from './format.ts';

test('money follows the mock-up: two decimals under $10bn, one above, whole millions from $10m', () => {
    const cases: [number, string][] = [
        [10.44e9, '$10.4bn'],
        [6.384e9, '$6.38bn'],
        [366.4e6, '$366m'],
        [47.2e6, '$47m'],
        [4.54e6, '$4.5m'],
        [400e3, '$400k'],
        [0, '$0'],
        // A figure that rounds up to the next unit prints in the larger unit.
        [999.7e6, '$1.00bn'],
        [9.97e6, '$10m'],
        [999.6e3, '$1.0m'],
        [9.996e9, '$10.0bn'],
    ];

    assert.deepEqual(
        cases.map(([dollars]) => money(dollars)),
        cases.map(([, text]) => text),
    );
});

test('axisMoney drops trailing zeros and reaches down to thousands', () => {
    assert.deepEqual([0, 250e3, 2.5e6, 500e6, 2.5e9, 8e9].map(axisMoney), [
        '0',
        '$250k',
        '$2.5m',
        '$500m',
        '$2.5bn',
        '$8bn',
    ]);
});

test('head counts, shares, deaths and lists', () => {
    assert.deepEqual([1_401_000, 452_300, 999_700, 800].map(people), [
        '1.40 million',
        '452,000',
        '1.00 million',
        '800',
    ]);
    assert.deepEqual([1_401_000, 452_300, 800].map(peopleShort), ['1.40m', '452k', '800']);
    assert.equal(pct(0.6579), '66%');
    assert.deepEqual([20_810, 640.4].map(deathCount), ['20,800', '640']);
    assert.equal(listOf(['a', 'b', 'c']), 'a, b, and c');
    assert.equal(listOf(['a', 'b']), 'a and b');
});
