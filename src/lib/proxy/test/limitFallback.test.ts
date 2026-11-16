/**
 * `limitFallback.ts`: the in-memory count a server instance falls back to
 * when the shared count is unavailable.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createFallbackCounter } from '../limitFallback.ts';

test('fallback: holds a key to its limit within a window and starts over in the next', () => {
    let now = 1_000_000 * 60_000;
    const counter = createFallbackCounter(60, { now: () => now });
    const verdicts = Array.from({ length: 4 }, () => counter.hit('api:1.2.3.4', 3));

    assert.deepEqual(
        verdicts.map(({ allowed, remaining }) => [allowed, remaining]),
        [
            [true, 2],
            [true, 1],
            [true, 0],
            [false, 0],
        ],
    );
    assert.equal(verdicts[0]!.limit, 3);
    assert.equal(verdicts[0]!.reset, 60);

    now += 30_000;
    assert.equal(counter.hit('api:1.2.3.4', 3).reset, 30);

    now += 30_000;
    assert.deepEqual(counter.hit('api:1.2.3.4', 3), {
        allowed: true,
        limit: 3,
        remaining: 2,
        reset: 60,
    });
});

test('fallback: keys count apart, and the limit can differ per call', () => {
    const counter = createFallbackCounter(60);

    assert.equal(counter.hit('api:a', 1).allowed, true);
    assert.equal(counter.hit('api:a', 1).allowed, false);
    assert.equal(counter.hit('api:b', 1).allowed, true);
    assert.equal(counter.hit('mcp:a', 1).allowed, true);
});

test('fallback: memory is bounded, dropping ended windows first and then the oldest keys', () => {
    let now = 0;
    const counter = createFallbackCounter(60, { now: () => now, maxKeys: 3 });

    for (const key of ['a', 'b', 'c', 'd', 'e']) {
        counter.hit(key, 10);
    }

    assert.equal(counter.size(), 3);

    // The oldest were dropped, so 'a' starts over; the newest kept its count.
    assert.equal(counter.hit('e', 10).remaining, 8);
    assert.equal(counter.hit('a', 10).remaining, 9);

    now += 61_000;
    counter.hit('z', 10);
    assert.equal(counter.size(), 1);
});
