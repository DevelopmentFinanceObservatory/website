/**
 * `fetchComponentRevision`: the payload of a revision, or null with a logged
 * reason when the read fails.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchComponentRevision } from '../studioClient.ts';

test('fetchComponentRevision: a refused read is null and logs the ids and status', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 502 }));
    const warn = t.mock.method(console, 'warn', () => {});

    assert.equal(await fetchComponentRevision('cmp_9f8e', 3), null);
    assert.deepEqual(warn.mock.calls[0]?.arguments[1], {
        componentId: 'cmp_9f8e',
        revision: 3,
        status: 502,
    });
});

test('fetchComponentRevision: a network failure is null and logs the ids and the error', async (t) => {
    const failure = new Error('offline');

    t.mock.method(globalThis, 'fetch', async () => {
        throw failure;
    });
    const warn = t.mock.method(console, 'warn', () => {});

    assert.equal(await fetchComponentRevision('cmp_9f8e', 3), null);
    assert.deepEqual(warn.mock.calls[0]?.arguments[1], {
        componentId: 'cmp_9f8e',
        revision: 3,
        error: failure,
    });
});

test('fetchComponentRevision: the resolved payload comes back as read', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ resolved_payload: { component: { type: 'stat_card' } } }),
    );

    assert.deepEqual(await fetchComponentRevision('cmp_9f8e', 3), {
        component: { type: 'stat_card' },
    });
});
