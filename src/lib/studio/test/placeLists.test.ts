import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type PlaceListAt, placeLists } from '../placeLists.ts';
import type { PlaceOptionsRead } from '../studioClient.ts';

// A read the store failed to settle would hang a test, so each gives up
// after a second.
const SETTLE = { timeout: 1000 };

// A `run` whose reads the test answers by hand, in the order they started.
const controlled = () => {
    const calls: {
        at: PlaceListAt;
        signal: AbortSignal;
        answer: (read: PlaceOptionsRead) => void;
    }[] = [];
    const run = (at: PlaceListAt, signal: AbortSignal) =>
        new Promise<PlaceOptionsRead>((resolve) => calls.push({ at, signal, answer: resolve }));

    return { calls, lists: placeLists(run) };
};

const options = (label: string): PlaceOptionsRead => ({
    kind: 'options',
    options: [{ id: `country/${label}`, label }],
    truncated: false,
});

const FAILED: PlaceOptionsRead = {
    kind: 'failed',
    status: 503,
    code: null,
    detail: null,
    retry: true,
};

const at = (revision: number, conversation = 'conv_1', role = 'origin'): PlaceListAt => ({
    conversation,
    componentId: 'cmp_1',
    revision,
    role,
});

test(
    'a read for a newer revision stops the older one, whose late answer the store ignores',
    SETTLE,
    async () => {
        const { calls, lists } = controlled();
        const caller = new AbortController();
        const old = lists.read(at(1), caller.signal);
        const fresh = lists.read(at(2));

        assert.equal(calls.length, 2);
        assert.equal(calls[0]!.signal.aborted, true);
        assert.equal(calls[1]!.signal.aborted, false);

        calls[0]!.answer(options('KEN'));
        calls[1]!.answer(options('GHA'));
        // The old run answered, but the store has stopped it, so its caller
        // rejects with the stop and the store keeps revision 2's read.
        await assert.rejects(old);
        assert.deepEqual(await lists.read(at(2)), options('GHA'));
        assert.equal(await fresh, await lists.read(at(2)));
        assert.equal(calls.length, 2);
    },
);

test('drop stops the card’s reads, and a caller of one rejects', SETTLE, async () => {
    const { calls, lists } = controlled();
    const caller = new AbortController();
    const read = lists.read(at(1), caller.signal);

    lists.drop('cmp_1');
    assert.equal(calls[0]!.signal.aborted, true);
    await assert.rejects(read);

    lists.read(at(1));
    assert.equal(calls.length, 2);
});

test('another conversation reads its own list, and a failed read is not kept', SETTLE, async () => {
    const { calls, lists } = controlled();
    const first = lists.read(at(1));

    calls[0]!.answer(options('KEN'));
    await first;

    const other = lists.read(at(1, 'conv_2'));

    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.at.conversation, 'conv_2');

    calls[1]!.answer(FAILED);
    assert.equal((await other).kind, 'failed');

    const again = lists.read(at(1, 'conv_2'));

    assert.equal(calls.length, 3);
    calls[2]!.answer(options('GHA'));
    assert.deepEqual(await again, options('GHA'));
});
