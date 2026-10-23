/**
 * `rateHeaders.ts`: a counted call advertises its limit, an uncounted one
 * advertises none.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { rateHeaders, type RateVerdict } from '../rateHeaders.ts';

const counted: RateVerdict = { allowed: true, counted: true, limit: 120, remaining: 7, reset: 41 };

test('a counted call carries the three X-RateLimit headers', () => {
    assert.deepEqual(rateHeaders(counted), {
        'X-RateLimit-Limit': '120',
        'X-RateLimit-Remaining': '7',
        'X-RateLimit-Reset': '41',
    });
});

test('a call passed without a count carries no X-RateLimit header', () => {
    assert.deepEqual(rateHeaders({ ...counted, counted: false, remaining: 120, reset: 60 }), {});
});
