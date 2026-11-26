import assert from 'node:assert/strict';
import test from 'node:test';

import { redactSharePage, safeErrorCode } from '../events/limits.ts';

test('a share id in the page is written :id before any sink sees it', () => {
    const cases: [string, string][] = [
        ['/s/Ab3_xY', '/s/:id'],
        ['/s/Ab3_xY/download/preparing', '/s/:id/download/preparing'],
        ['/embed/Ab3_xY', '/embed/:id'],
        ['/s/Ab3_xY?mode=live', '/s/:id?mode=live'],
        ['/studio', '/studio'],
        ['/data/s/x', '/data/s/x'],
    ];

    for (const [page, expected] of cases) {
        assert.equal(redactSharePage(page), expected, page);
    }
});

test('a failed write logs a code and never its message', () => {
    const drizzle = Object.assign(new Error('Failed query: insert ... params: secret-key'), {
        cause: Object.assign(new Error('duplicate key'), { code: '23505' }),
    });
    const cases: [unknown, string][] = [
        [drizzle, '23505'],
        [Object.assign(new Error('timeout'), { code: '57014' }), '57014'],
        [new TypeError('fetch failed: secret-key'), 'TypeError'],
        ['secret-key', 'unknown'],
    ];

    for (const [error, expected] of cases) {
        assert.equal(safeErrorCode(error), expected);
    }
});
