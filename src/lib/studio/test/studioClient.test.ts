/**
 * `fetchComponentRevision`: the payload of a revision, or null with a logged
 * reason when the read fails.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cancelTurn, fetchComponentRevision, runInterrupt, runTurn } from '../studioClient.ts';
import type { StudioFrame } from '../wire.ts';

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

const switchReply = {
    decision: 'switch',
    choice_id: 'spec_1:measure_basis',
    option_id: 'measure_basis:net',
    plan_revision: 'rev-a',
} as const;

const staleBody = {
    error: 'edit_conflict',
    retry: 'refresh_then_retry',
    detail: 'plan revision rev-a is not the pending plan',
    constraint_id: 'plan_revision_stale',
};

test('runInterrupt: a switch posts exactly the interrupt members and the switch fields', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(''));

    await runInterrupt('conv', 'int-1', switchReply, { onFrame: () => {} });

    const init = fetch.mock.calls[0]?.arguments[1] as RequestInit;

    assert.deepEqual(JSON.parse(init.body as string), {
        kind: 'interrupt.response',
        schema_version: 1,
        conversation_id: 'conv',
        interrupt_id: 'int-1',
        ...switchReply,
    });
});

test('runInterrupt: a refusal reaches onRefusal with its status and ToolError, and no error frame', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json(staleBody, { status: 409 }));
    const frames: StudioFrame[] = [];
    const refusals: unknown[] = [];

    await runInterrupt('conv', 'int-1', switchReply, {
        onFrame: (frame) => frames.push(frame),
        onRefusal: (refusal) => {
            refusals.push(refusal);

            return true;
        },
    });

    assert.deepEqual(refusals, [{ status: 409, detail: staleBody.detail, error: staleBody }]);
    assert.deepEqual(frames, []);
});

test('runInterrupt: a refusal onRefusal leaves is an error frame with its detail', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ detail: 'proxy failed' }, { status: 502 }),
    );
    const frames: StudioFrame[] = [];
    const refusals: unknown[] = [];

    await runInterrupt('conv', 'int-1', switchReply, {
        onFrame: (frame) => frames.push(frame),
        onRefusal: (refusal) => {
            refusals.push(refusal);

            return false;
        },
    });

    assert.deepEqual(refusals, [{ status: 502, detail: 'proxy failed', error: null }]);
    assert.equal(frames.length, 1);
    assert.equal(frames[0]?.event === 'error' && frames[0].error.detail, 'proxy failed');
});

test('runInterrupt: a stale refusal hands onRefusal the current plan as sent', async (t) => {
    const currentPlan = {
        event: 'plan.proposed',
        seq: 9,
        interrupt_id: 'int-2',
        plan_version_id: 'pv-2',
        version: 2,
        title: 'Health aid to Ghana',
        steps: [],
        actions: ['approve', 'amend', 'reject'],
        revision: 'rev-b',
    };

    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ ...staleBody, current_plan: currentPlan }, { status: 409 }),
    );
    let seen: unknown = null;

    await runInterrupt(
        'conv',
        'int-1',
        { decision: 'approve', plan_revision: 'rev-a' },
        {
            onFrame: () => {},
            onRefusal: (refusal) => {
                seen = refusal.error?.current_plan;

                return true;
            },
        },
    );

    assert.deepEqual(seen, currentPlan);
});
