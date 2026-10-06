/**
 * `fetchComponentRevision`: the payload of a revision, or null with a logged
 * reason when the read fails.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cancelTurn, fetchComponentRevision, runTurn } from '../studioClient.ts';

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

test('runTurn: keep-alive comments reach onKeepAlive, data lines reach onFrame', async (t) => {
    const body = ': ka\n\ndata: {"event":"done","seq":1}\n\n: ka\n\n';

    t.mock.method(globalThis, 'fetch', async () => new Response(body));
    const seen: string[] = [];

    await runTurn('conv', 'hi', {
        onFrame: (frame) => seen.push(frame.event),
        onKeepAlive: () => seen.push('keep-alive'),
    });

    assert.deepEqual(seen, ['keep-alive', 'done', 'keep-alive']);
});

test('cancelTurn: a cancel request that never answers settles once the bound passes', async (t) => {
    // Like a real fetch, a pending request rejects when its signal aborts.
    t.mock.method(
        globalThis,
        'fetch',
        (_url: unknown, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            }),
    );

    const outcome = await Promise.race([
        cancelTurn('conv', 20).then(() => 'settled'),
        new Promise((resolve) => setTimeout(resolve, 2_000, 'hung')),
    ]);

    assert.equal(outcome, 'settled');
});
