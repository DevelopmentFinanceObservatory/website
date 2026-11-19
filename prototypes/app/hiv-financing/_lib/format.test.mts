import assert from 'node:assert/strict';
import test from 'node:test';

import {
    axisMoney,
    deathCount,
    listOf,
    money,
    people,
    peopleShort,
    perPerson,
    pct,
    mixPercents,
    wholePercents,
} from './format.ts';

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

test('aid per person has a thousands separator and reads "under $1" for a value that rounds to 0', () => {
    assert.deepEqual([134.4, 8_736.2, 0.4, 0].map(perPerson), ['$134', '$8,736', 'under $1', '$0']);
});

test('wholePercents rounds by largest remainder to sum to 100, with "<1%" for a small share', () => {
    assert.deepEqual(wholePercents({ a: 1, b: 1, c: 1 }), { a: '34%', b: '33%', c: '33%' });
    // Plain rounding gives 34%, 34% and 33%, summing to 101.
    assert.deepEqual(wholePercents({ a: 0.335, b: 0.335, c: 0.33 }), {
        a: '34%',
        b: '33%',
        c: '33%',
    });
    assert.deepEqual(wholePercents({ a: 0.996, b: 0.004, c: 0 }), { a: '>99%', b: '<1%', c: '0%' });
    assert.deepEqual(wholePercents({ a: 0, b: 0 }), { a: '0%', b: '0%' });
});

test('mixPercents prints one decimal when a share is within half a point of 50%', () => {
    // DR Congo's Global Fund share of 50.004% and Malawi's US share of 49.86% both print 50% whole.
    assert.deepEqual(mixPercents({ us: 0.4986, globalFund: 0.5, other: 0.0014 }), {
        us: '49.9%',
        globalFund: '50.0%',
        other: '0.1%',
    });
    assert.deepEqual(mixPercents({ us: 0.6, globalFund: 0.4, other: 0.0004 }), {
        us: '60%',
        globalFund: '40%',
        other: '<1%',
    });
    assert.deepEqual(mixPercents({ us: 0.5, globalFund: 0.49996, other: 0.00004 }).other, '<0.1%');
});
