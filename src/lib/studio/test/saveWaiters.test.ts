import assert from 'node:assert/strict';
import test from 'node:test';

import { createSaveWaiters } from '../saveWaiters.ts';

test('a waiter hears its conversation saved, and false once the page tracks another', async () => {
    const waiters = createSaveWaiters();
    const heard: [string, boolean][] = [];
    const restored = waiters.wait('conv_restored').then((saved) => heard.push(['restored', saved]));
    const left = waiters.wait('conv_left').then((saved) => heard.push(['left', saved]));

    waiters.track('conv_restored');
    await left;
    assert.deepEqual(heard, [['left', false]]);

    waiters.saved('conv_other');
    await Promise.resolve();
    assert.deepEqual(heard, [['left', false]], 'another conversation saved settles nothing');

    waiters.saved('conv_restored');
    await restored;
    assert.deepEqual(heard, [
        ['left', false],
        ['restored', true],
    ]);
});

test('a failed save settles the waiters of its conversation false and no others', async () => {
    const waiters = createSaveWaiters();
    const heard: [string, boolean][] = [];
    const failing = waiters.wait('conv_failing').then((saved) => heard.push(['failing', saved]));
    void waiters.wait('conv_other').then((saved) => heard.push(['other', saved]));

    waiters.failed('conv_failing');
    await failing;
    assert.deepEqual(heard, [['failing', false]]);
});
