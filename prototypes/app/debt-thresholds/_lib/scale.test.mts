import assert from 'node:assert/strict';
import test from 'node:test';

import { ticksTo } from './scale.ts';

test('ticksTo ends at the first nice value covering the maximum, in at most five steps', () => {
    assert.deepEqual(ticksTo(108.3), [0, 25, 50, 75, 100, 125]);
    assert.deepEqual(ticksTo(85), [0, 20, 40, 60, 80, 100]);
    assert.deepEqual(ticksTo(55), [0, 20, 40, 60]);
    assert.deepEqual(ticksTo(40), [0, 10, 20, 30, 40]);
    assert.deepEqual(ticksTo(23), [0, 5, 10, 15, 20, 25]);
});
