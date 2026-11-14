/**
 * `counts.ts`: a value list's size as the screens show it, marked when the
 * list is partial.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { memberTotal, ofMembers, valueCount, valueListLabel } from '../counts.ts';

for (const [complete, total, values, of, label, labelUsed] of [
    [
        true,
        '1,400',
        '1,400 values',
        '12 of 1,400',
        '1,400 values',
        '1,400 values, CRS uses 12 of 1,400',
    ],
    [
        false,
        '1,400 listed (partial list)',
        '1,400 values listed (partial list)',
        '12 of the 1,400 listed (partial list)',
        '1,400 values listed (partial list)',
        '1,400 values listed (partial list), CRS uses 12 of the 1,400 listed',
    ],
] as const) {
    test(`a ${complete ? 'complete' : 'partial'} value list's size`, () => {
        const used = { used: 12, of: 1400, complete };
        assert.equal(memberTotal(1400, complete), total);
        assert.equal(valueCount(1400, complete), values);
        assert.equal(ofMembers(used), of);
        assert.equal(valueListLabel(1400, complete, null), label);
        assert.equal(valueListLabel(1400, complete, { user: 'CRS', values: used }), labelUsed);
    });
}
