import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatChange,
    formatMoney,
    formatPeople,
    formatPerDollar,
    formatTick,
    listOf,
    ordinal,
} from './format.ts';

test('formatMoney writes compact dollars, whole billions from $10bn, with a true minus', () => {
    assert.deepEqual(
        [106.21e9, 63.8e9, 1_234_000_000, 640_400_000, 4_520_000, 450_000, -120_000_000, 0].map(
            formatMoney,
        ),
        ['$106bn', '$64bn', '$1.2bn', '$640m', '$4.5m', '$450k', '−$120m', '$0'],
    );
    assert.deepEqual([0, 2e9, 2.5e9, 500e6].map(formatTick), ['0', '$2bn', '$2.5bn', '$500m']);
    assert.deepEqual([2.0523e9, 560.4e6, 1.24e6].map(formatPeople), ['2.05bn', '560m', '1.2m']);
});

test('formatChange, formatPerDollar, ordinal and listOf', () => {
    assert.deepEqual([-0.1234, 0.03, 0.001].map(formatChange), ['−12%', '+3%', '0%']);
    assert.deepEqual([0.01, 0.301, 1.4, 0.999, 29.86].map(formatPerDollar), [
        '1 cent',
        '30 cents',
        '$1.40',
        '$1.00',
        '$30',
    ]);
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 62].map(ordinal), [
        '1st',
        '2nd',
        '3rd',
        '4th',
        '11th',
        '12th',
        '13th',
        '21st',
        '22nd',
        '62nd',
    ]);
    assert.deepEqual([[], ['a'], ['a', 'b'], ['a', 'b', 'c']].map(listOf), [
        '',
        'a',
        'a and b',
        'a, b, and c',
    ]);
});
