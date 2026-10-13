import assert from 'node:assert/strict';
import test from 'node:test';

import { EXAMPLE_PROMPTS, pickExamples } from '../examples.ts';

test('pickExamples draws three distinct prompts from the pool', () => {
    for (let run = 0; run < 200; run++) {
        const drawn = pickExamples();

        assert.equal(drawn.length, 3);
        assert.equal(new Set(drawn).size, 3);
        assert.ok(drawn.every((prompt) => (EXAMPLE_PROMPTS as readonly string[]).includes(prompt)));
    }
});

test('pickExamples can reach the last prompt in the pool', () => {
    // random() just under 1 picks the last remaining item first.
    assert.equal(pickExamples(['a', 'b', 'c', 'd'], 2, () => 0.999)[0], 'd');
});

test('pickExamples returns the whole pool when it is smaller than the count', () => {
    assert.deepEqual(pickExamples(['a', 'b'], 3, () => 0).sort(), ['a', 'b']);
});
