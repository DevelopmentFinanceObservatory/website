import assert from 'node:assert/strict';
import test from 'node:test';

import { createSaveQueue } from '../saveQueue.ts';

type Save = { id: string; version: number };

// A send whose saves stay in flight until the test lands them.
const harness = () => {
    const inFlight: { save: Save; land: (ok: boolean) => void }[] = [];
    const settled: [Save, boolean][] = [];
    const queue = createSaveQueue<Save>(
        (save) =>
            new Promise((resolve) => {
                inFlight.push({ save, land: resolve });
            }),
        (save, ok) => settled.push([save, ok]),
    );
    // Lands the oldest save in flight and lets the queue send the next.
    const land = async (ok = true) => {
        inFlight.shift()!.land(ok);
        await new Promise((resolve) => setImmediate(resolve));
    };

    return { queue, inFlight, settled, land };
};

test("a conversation's saves go one at a time, the latest snapshot after the one in flight", async () => {
    const { queue, inFlight, settled, land } = harness();

    queue.push({ id: 'a', version: 1 });
    queue.push({ id: 'a', version: 2 });
    queue.push({ id: 'a', version: 3 });

    assert.deepEqual(
        inFlight.map(({ save }) => save),
        [{ id: 'a', version: 1 }],
    );

    // A failed save still lets the next one out.
    await land(false);

    assert.deepEqual(
        inFlight.map(({ save }) => save),
        [{ id: 'a', version: 3 }],
    );

    await land();

    assert.equal(inFlight.length, 0);
    assert.deepEqual(settled, [
        [{ id: 'a', version: 1 }, false],
        [{ id: 'a', version: 3 }, true],
    ]);

    // Idle again, a save goes out at once.
    queue.push({ id: 'a', version: 4 });

    assert.deepEqual(
        inFlight.map(({ save }) => save),
        [{ id: 'a', version: 4 }],
    );
});

test('another conversation queued behind a save goes out after it', async () => {
    const { queue, settled, land } = harness();

    queue.push({ id: 'a', version: 1 });
    queue.push({ id: 'b', version: 1 });
    queue.push({ id: 'a', version: 2 });
    await land();
    await land();
    await land();

    assert.deepEqual(
        settled.map(([save]) => save),
        [
            { id: 'a', version: 1 },
            { id: 'b', version: 1 },
            { id: 'a', version: 2 },
        ],
    );
});

test('a save sent now goes out past the one in flight, and later saves wait for both', async () => {
    const { queue, inFlight, settled, land } = harness();

    queue.push({ id: 'a', version: 1 });
    queue.push({ id: 'a', version: 2 });
    queue.sendNow({ id: 'a', version: 3 });

    // Version 2, queued, is replaced by version 3, which is already out.
    assert.deepEqual(
        inFlight.map(({ save }) => save),
        [
            { id: 'a', version: 1 },
            { id: 'a', version: 3 },
        ],
    );

    queue.push({ id: 'a', version: 4 });
    await land();

    assert.equal(inFlight.length, 1);

    await land();
    await land();

    assert.deepEqual(
        settled.map(([save]) => save.version),
        [1, 3, 4],
    );
});
