/**
 * `fetchComponentRevision`: the payload of a revision, or null with a logged
 * reason when the read fails.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    cancelTurn,
    fetchComponentRevision,
    runApplyChoice,
    runInterrupt,
    runTurn,
    type StreamRefusal,
} from '../studioClient.ts';
import type { ApplyChoiceSuggestion, StudioFrame } from '../wire.ts';

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

test("runInterrupt: a problem document the proxy answered with itself reaches onRefusal as the proxy's", async (t) => {
    const proxyProblem = (status: number, body: Record<string, unknown>, headers = {}) =>
        Response.json(
            { status, detail: 'proxy text', retryable: true, ...body },
            { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
        );
    const cases: [string, Response, unknown][] = [
        [
            'a rate limit, with its Retry-After',
            proxyProblem(429, { code: 'rate_limited' }, { 'Retry-After': '12' }),
            { code: 'rate_limited', upstreamStatus: null, retryAfterSeconds: 12 },
        ],
        [
            'an unreachable harness',
            proxyProblem(502, { code: 'transient_unavailable' }),
            { code: 'transient_unavailable', upstreamStatus: null, retryAfterSeconds: null },
        ],
        [
            'a harness that answered before the relay failed',
            proxyProblem(502, { code: 'transient_unavailable', upstream_status: 422 }),
            { code: 'transient_unavailable', upstreamStatus: 422, retryAfterSeconds: null },
        ],
        [
            "a harness ToolError, which is not the proxy's",
            Response.json(staleBody, { status: 409 }),
            undefined,
        ],
    ];

    for (const [name, response, proxy] of cases) {
        await t.test(name, async (t) => {
            t.mock.method(globalThis, 'fetch', async () => response);
            const refusals: StreamRefusal[] = [];

            await runInterrupt('conv', 'int-1', switchReply, {
                onFrame: () => {},
                onRefusal: (refusal) => {
                    refusals.push(refusal);

                    return true;
                },
            });

            assert.deepEqual(refusals[0]?.proxy, proxy);
        });
    }
});

test('runInterrupt: a request no server answered goes to onUnreachable, a server error does not', async (t) => {
    const cases: [string, () => Promise<Response>, number, number][] = [
        [
            'fetch rejects',
            async () => {
                throw new TypeError('Failed to fetch');
            },
            1,
            0,
        ],
        ['a 502', async () => Response.json({ detail: 'proxy failed' }, { status: 502 }), 0, 1],
        [
            'an error frame',
            async () =>
                new Response(
                    'data: {"event":"error","seq":2,"error":{"error":"transient_unavailable","retry":"retry_after_delay","detail":"Failed to fetch"}}\n\n',
                ),
            0,
            1,
        ],
    ];

    for (const [name, respond, unreached, errors] of cases) {
        await t.test(name, async (t) => {
            t.mock.method(globalThis, 'fetch', respond);
            const frames: StudioFrame[] = [];
            let calls = 0;

            await runInterrupt('conv', 'int-1', switchReply, {
                onFrame: (frame) => frames.push(frame),
                onRefusal: () => false,
                onUnreachable: () => {
                    calls += 1;

                    return true;
                },
            });

            assert.equal(calls, unreached);
            assert.equal(frames.filter((frame) => frame.event === 'error').length, errors);
        });
    }
});

test('runInterrupt: an unreachable request onUnreachable leaves is an error frame', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('Failed to fetch');
    });
    const frames: StudioFrame[] = [];

    await runInterrupt('conv', 'int-1', switchReply, {
        onFrame: (frame) => frames.push(frame),
        onUnreachable: () => false,
    });

    assert.deepEqual(
        frames.map((frame) => frame.event),
        ['error'],
    );
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

test('runApplyChoice: a chip posts the harness fixture request, with no message', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(''));
    // The harness's wire fixtures (`services/harness/tests/wire_fixtures/studio`
    // in dfo-ai), copied. The request names the conversation by the
    // `session_id` alias the harness also accepts.
    const read = (name: string): unknown =>
        JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
    const { session_id: conversation, ...request } = read(
        'request-13-turn-apply-choice.json',
    ) as Record<string, unknown> & { session_id: string };
    const { items } = read('event-15-suggestions-apply-choice.json') as {
        items: ApplyChoiceSuggestion[];
    };
    const chip = items[0];

    assert.ok(chip);
    await runApplyChoice(conversation, chip, { onFrame: () => {} });

    const init = fetch.mock.calls[0]?.arguments[1] as RequestInit;

    assert.equal(fetch.mock.calls[0]?.arguments[0], '/api/studio/turn');
    const body = JSON.parse(init.body as string) as { apply_choice: Record<string, unknown> };

    assert.deepEqual(body, { ...request, conversation_id: conversation });
    assert.equal(body.apply_choice.turn, chip.turn);
    assert.equal(body.apply_choice.spec_id, chip.spec_id);
});

test('runApplyChoice: a 422 chip refusal reaches onRefusal, and no error frame', async (t) => {
    const body = {
        error: 'constraint_violation',
        retry: 'do_not_retry',
        detail: 'That option is not offered here.',
        constraint_id: 'switch_option_unavailable',
        pointer: '/apply_choice',
    };

    t.mock.method(globalThis, 'fetch', async () => Response.json(body, { status: 422 }));
    const frames: StudioFrame[] = [];
    const refusals: unknown[] = [];

    await runApplyChoice(
        'conv',
        { choice_id: 'spec_1:sector', option_id: 'sector:120', turn: 1, spec_id: 'spec_1' },
        {
            onFrame: (frame) => frames.push(frame),
            onRefusal: (refusal) => {
                refusals.push(refusal);

                return true;
            },
        },
    );

    assert.deepEqual(refusals, [{ status: 422, detail: body.detail, error: body }]);
    assert.deepEqual(frames, []);
});
