import assert from 'node:assert/strict';
import test from 'node:test';

import { createSaveStamp, createSaveWaiters } from '../saveWaiters.ts';

test('a waiter hears its conversation saved, and false once the page tracks another', async () => {
    const waiters = createSaveWaiters();
    const heard: [string, boolean][] = [];
    const restored = waiters.wait('conv_restored').then((saved) => heard.push(['restored', saved]));
    const left = waiters.wait('conv_left').then((saved) => heard.push(['left', saved]));

    waiters.track('conv_restored');
    await left;
    assert.deepEqual(heard, [['left', false]]);

    waiters.sending('conv_other')(true);
    await Promise.resolve();
    assert.deepEqual(heard, [['left', false]], 'another conversation saved settles nothing');

    waiters.sending('conv_restored')(true);
    await restored;
    assert.deepEqual(heard, [
        ['left', false],
        ['restored', true],
    ]);
});

test('a refused save settles its waiters false once no other save of it is in flight', async () => {
    const waiters = createSaveWaiters();
    const heard: [string, boolean][] = [];
    const failing = waiters.wait('conv_failing').then((saved) => heard.push(['failing', saved]));
    void waiters.wait('conv_other').then((saved) => heard.push(['other', saved]));
    const first = waiters.sending('conv_failing');
    const second = waiters.sending('conv_failing');

    first(false);
    await Promise.resolve();
    assert.deepEqual(heard, [], 'the second save may still land');

    second(false);
    await failing;
    assert.deepEqual(heard, [['failing', false]]);

    // A refused save with a later one that lands settles true.
    const landing = waiters.wait('conv_landing');
    const refused = waiters.sending('conv_landing');
    const taken = waiters.sending('conv_landing');

    refused(false);
    taken(true);
    assert.equal(await landing, true);
});

test("each snapshot carries the page's writer and a sequence number that grows", () => {
    const stamp = createSaveStamp('writer_a');

    assert.deepEqual(
        [stamp(), stamp(), stamp()],
        [1, 2, 3].map((saveSeq) => ({ saveWriter: 'writer_a', saveSeq })),
    );

    // Another page load mints its own writer.
    const { saveWriter } = createSaveStamp()();

    assert.notEqual(saveWriter, createSaveStamp()().saveWriter);
});
