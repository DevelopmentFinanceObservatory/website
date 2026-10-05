/**
 * `formatPeriod`: an ISO 8601 interval reads with an en dash, any other
 * period as it is. `formatWindow`: a window of one period reads once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPeriod, formatWindow } from '../period.ts';

const CASES: [string, string, string][] = [
    ['year point', '2023', '2023'],
    ['month point', '2023-04', '2023-04'],
    ['year span', '2018/2022', '2018–2022'],
    ['month span', '2018-01/2022-12', '2018-01–2022-12'],
    ['day span', '2018-01-05/2022-12-31', '2018-01-05–2022-12-31'],
    ['empty', '', ''],
];

for (const [name, period, expected] of CASES) {
    test(`formatPeriod: ${name}`, () => {
        assert.equal(formatPeriod(period), expected);
    });
}

test('formatWindow: one period once, a span with an en dash between its ends', () => {
    assert.equal(formatWindow({ start: '2024', end: '2024' }), '2024');
    assert.equal(formatWindow({ start: '2020', end: '2024' }), '2020–2024');
});
