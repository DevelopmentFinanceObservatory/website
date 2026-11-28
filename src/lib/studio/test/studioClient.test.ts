/**
 * `fetchComponentRevision`: the payload of a revision, or null with a logged
 * reason when the read fails.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';

import {
    cancelTurn,
    CompositionRefusal,
    fetchComponentRevision,
    isNoBlock,
    isStaleRevision,
    mutateComposition,
    readState,
    runApplyChoice,
    runApplyUnit,
    runInterrupt,
    runTurn,
    heldTurnListener,
    startHeldTurn,
    STATE_READ_ATTEMPTS,
    takeHeldTurn,
    stopAction,
    watchAdmission,
    type CancelAnswer,
    type StopAction,
    whileBusy,
    type StreamRefusal,
    handoffExtras,
    type TurnExtras,
} from '../studioClient.ts';
import { cardUnitChange } from '../cardUnit.ts';
import { widgetFromComponent } from '../widgets.ts';
import type {
    ApplyChoiceSuggestion,
    ComponentCreated,
    Seed,
    StudioFrame,
    TurnRequest,
} from '../wire.ts';

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
        cancelTurn('conv', null, 20).then(() => 'settled'),
        new Promise((resolve) => setTimeout(resolve, 2_000, 'hung')),
    ]);

    assert.equal(outcome, 'settled');
});

test('cancelTurn names its turn, and a turn the conversation moved past stopped nothing', async (t) => {
    const cases: [string, number | null, Response[], CancelAnswer, (number | undefined)[]][] = [
        ['the turn named', 4, [new Response(null, { status: 204 })], 'stopped', [4]],
        [
            'a later turn began',
            4,
            [Response.json({ code: 'turn_moved', turn_index: 5 })],
            'moved',
            [4],
        ],
        ['no turn known', null, [new Response(null, { status: 204 })], 'stopped', [undefined]],
        // A harness from before `turn_index` refuses the member.
        [
            'an older harness',
            4,
            [
                Response.json(
                    { detail: [{ type: 'extra_forbidden', loc: ['body', 'turn_index'] }] },
                    { status: 422 },
                ),
                new Response(null, { status: 204 }),
            ],
            'stopped',
            [4, undefined],
        ],
        // Any other refusal goes no further.
        [
            'another refusal',
            4,
            [Response.json({ detail: [{ loc: ['body', 'kind'] }] }, { status: 422 })],
            'unanswered',
            [4],
        ],
        // A cancel that met the turn's claim mid-way names the same turn,
        // and goes once more.
        [
            'the same turn moved',
            4,
            [
                Response.json({ code: 'turn_moved', turn_index: 4 }),
                new Response(null, { status: 204 }),
            ],
            'stopped',
            [4, 4],
        ],
    ];

    for (const [label, turnIndex, answers, expected, sent] of cases) {
        const fetch = t.mock.method(globalThis, 'fetch', async () => answers.shift()!);

        assert.equal(await cancelTurn('conv', turnIndex), expected, label);
        assert.deepEqual(
            fetch.mock.calls.map(
                (call) => JSON.parse((call.arguments[1] as RequestInit).body as string).turn_index,
            ),
            sent,
            label,
        );
        fetch.mock.restore();
    }
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
        client_features: ['unit_question', 'multi_select'],
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
    // in dfo-ai), copied.
    const read = (name: string): unknown =>
        JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
    const request = read('request-13-turn-apply-choice.json') as Record<string, unknown> & {
        conversation_id: string;
    };
    const conversation = request.conversation_id;
    const { items } = read('event-15-suggestions-apply-choice.json') as {
        items: ApplyChoiceSuggestion[];
    };
    const chip = items[0];

    assert.ok(chip);
    await runApplyChoice(conversation, chip, { onFrame: () => {} });

    const init = fetch.mock.calls[0]?.arguments[1] as RequestInit;

    assert.equal(fetch.mock.calls[0]?.arguments[0], '/api/studio/turn');
    const body = JSON.parse(init.body as string) as { apply_choice: Record<string, unknown> };

    assert.deepEqual(body, { ...request, client_features: ['unit_question', 'multi_select'] });
    assert.equal(body.apply_choice.turn, chip.turn);
    assert.equal(body.apply_choice.spec_id, chip.spec_id);
});

test('runApplyUnit: a card pick posts the harness fixture request, with no message', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(''));
    // The harness's wire fixtures, copied: the card the frame draws, in turn
    // 2, moved to current Kenyan shillings.
    const read = (name: string): unknown =>
        JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
    const request = read('request-16-turn-apply-unit.json') as TurnRequest;
    const widget = widgetFromComponent(
        read('event-19-component-unit-change.json') as ComponentCreated,
    );

    assert.ok(widget);
    const change = cardUnitChange({ ...widget, turn: 2 }, 'Debt service', {
        currency: 'KES',
        prices: 'current',
    });

    assert.ok(change);
    await runApplyUnit(request.conversation_id, change.request, { onFrame: () => {} });

    const init = fetch.mock.calls[0]?.arguments[1] as RequestInit;

    assert.equal(fetch.mock.calls[0]?.arguments[0], '/api/studio/turn');
    assert.deepEqual(JSON.parse(init.body as string), {
        ...request,
        client_features: ['unit_question', 'multi_select'],
    });
});

test('runTurn: a message turn posts the harness fixture request, with the client features', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(''));
    const request = JSON.parse(
        readFileSync(
            new URL('./fixtures/request-19-turn-client-features.json', import.meta.url),
            'utf8',
        ),
    ) as TurnRequest;

    await runTurn(request.conversation_id, request.message ?? '', { onFrame: () => {} });

    const init = fetch.mock.calls[0]?.arguments[1] as RequestInit;

    assert.deepEqual(JSON.parse(init.body as string), request);
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

test('whileBusy: a turn refused 409 while another stream holds the conversation is sent again after the wait', async (t) => {
    const answers = [
        Response.json(
            {
                error: 'transient_unavailable',
                retry: 'retry_after_delay',
                detail: 'another request is streaming on this conversation',
                retry_after_seconds: 4,
            },
            { status: 409 },
        ),
        new Response('data: {"event":"message.complete","seq":3,"text":"The answer."}\n\n'),
    ];
    const fetch = t.mock.method(globalThis, 'fetch', async () => answers.shift()!);
    const frames: StudioFrame[] = [];
    const refusals: StreamRefusal[] = [];
    const waits: number[] = [];
    const busy: (number | null)[] = [];

    await whileBusy(
        (handlers) => runTurn('conv', 'and in 2021?', handlers),
        {
            onFrame: (frame) => frames.push(frame),
            onRefusal: (refusal) => {
                refusals.push(refusal);

                return false;
            },
            onBusyWait: (seconds) => busy.push(seconds),
        },
        undefined,
        { sleep: async (ms) => void waits.push(ms) },
    );

    assert.equal(fetch.mock.callCount(), 2);
    assert.deepEqual(waits, [4000]);
    // The page holds no stream from the busy answer until the second send.
    assert.deepEqual(busy, [4, null]);
    assert.deepEqual(refusals, []);
    // The refusal's detail becomes no frame, so it cannot become the reply.
    assert.deepEqual(frames, [{ event: 'message.complete', seq: 3, text: 'The answer.' }]);
});

// The harness's answer while another stream holds the conversation.
const busyAnswer = (seconds: number) =>
    Response.json(
        {
            error: 'transient_unavailable',
            retry: 'retry_after_delay',
            detail: 'another request is streaming on this conversation',
            retry_after_seconds: seconds,
        },
        { status: 409 },
    );

test('whileBusy: a Stop while a send waits on another stream ends the wait, sends nothing more and cancels nothing', async (t) => {
    const answers = [
        busyAnswer(30),
        new Response('data: {"event":"message.complete","seq":3,"text":"The answer."}\n\n'),
    ];
    const fetch = t.mock.method(globalThis, 'fetch', async () => answers.shift()!);
    const controller = new AbortController();
    const waits: (number | null)[] = [];
    let action: StopAction | null = null;
    const admission = watchAdmission({
        onFrame: () => {},
        onBusyWait: (seconds) => {
            waits.push(seconds);

            // The user presses Stop as the wait begins.
            if (seconds !== null) {
                action = admission.stop(true);

                if (action.abort === 'now') {
                    controller.abort();
                }
            }
        },
    });

    admission.start();
    await assert.rejects(
        whileBusy(
            (handlers) => runTurn('conv', 'and in 2021?', handlers, controller.signal),
            admission.handlers,
            controller.signal,
            {
                // The wait as abortableSleep runs it, without the clock.
                sleep: async (_ms, signal) => signal?.throwIfAborted(),
            },
        ),
        { name: 'AbortError' },
    );

    assert.deepEqual(action, { cancel: 'none', abort: 'now', refunded: true });
    assert.equal(fetch.mock.callCount(), 1);
    assert.deepEqual(waits, [30]);
});

test('whileBusy: Stop cancels a turn the harness admitted at once, one on its way once the harness names it, and refunds a metered prompt only while unsent', async (t) => {
    const answers = [
        busyAnswer(4),
        new Response('data: {"event":"message.complete","seq":3,"text":"The answer."}\n\n', {
            headers: { 'x-dfo-turn-index': '3' },
        }),
    ];

    t.mock.method(globalThis, 'fetch', async () => answers.shift()!);

    // What Stop would do at each point the stream reports.
    const stops: [string, StopAction][] = [];
    const stop = (at: string) =>
        stops.push([at, stopAction({ phase: admission.phase(), metered: true })]);
    const admission = watchAdmission({
        onFrame: () => stop('frame'),
        onTurnIndex: () => stop('turn index'),
        onBusyWait: (seconds) => stop(seconds === null ? 'sent again' : 'waiting'),
    });

    stop('queued');
    admission.start();
    await whileBusy(
        (handlers) => runTurn('conv', 'and in 2021?', handlers),
        admission.handlers,
        undefined,
        { sleep: async () => {} },
    );

    const ends = { cancel: 'none', abort: 'now', refunded: true };
    const cancelsOnAdmit = { cancel: 'on-admit', abort: 'after-grace', refunded: false };
    const cancels = { cancel: 'now', abort: 'after-grace', refunded: false };

    assert.deepEqual(stops, [
        ['queued', ends],
        ['waiting', ends],
        ['sent again', cancelsOnAdmit],
        ['turn index', cancels],
        ['frame', cancels],
    ]);
    // A free request ended before it left had no prompt to give back.
    assert.equal(stopAction({ phase: 'unsent', metered: false }).refunded, false);
});

test("watchAdmission: a carried-on turn's Stop cancels that turn at once, and a later frame changes nothing", () => {
    const changes: StopAction[] = [];
    const admission = watchAdmission(
        { onFrame: () => {} },
        { onStopChange: (action) => changes.push(action), admittedTurn: 4 },
    );

    admission.start();
    assert.equal(admission.phase(), 'admitted');
    assert.equal(admission.turnIndex(), 4);
    assert.deepEqual(admission.stop(false), {
        cancel: 'now',
        abort: 'after-grace',
        refunded: false,
    });

    // The `done` that ends the stream after a hand-off to another turn.
    admission.handlers.onFrame({ event: 'done', seq: -1, trace_id: '', composition: null });
    assert.deepEqual(changes, []);
});

test("watchAdmission: a Stop's deferred cancel names the turn the harness admitted", () => {
    // The turn index each deferred action came with.
    const changes: [StopAction['cancel'], number | null][] = [];
    const admission = watchAdmission(
        { onFrame: () => {} },
        { onStopChange: (action) => changes.push([action.cancel, admission.turnIndex()]) },
    );

    admission.start();
    assert.equal(admission.turnIndex(), null);
    assert.equal(admission.stop(true).cancel, 'on-admit');
    admission.handlers.onTurnIndex?.(7);
    assert.deepEqual(changes, [['now', 7]]);
});

// A Stop after the turn's POST left and before its response headers: the
// harness may admit the turn after the client has gone and then hold it open
// with no stream, which a later reopen would resume.
for (const [name, answer, change] of [
    [
        'the harness names the turn',
        () =>
            new Response('data: {"event":"message.complete","seq":3,"text":"The answer."}\n\n', {
                headers: { 'x-dfo-turn-index': '3' },
            }),
        { cancel: 'now', abort: 'after-grace', refunded: false },
    ],
    [
        'the harness answers that another stream holds the conversation',
        () => busyAnswer(4),
        { cancel: 'none', abort: 'now', refunded: true },
    ],
] as const) {
    test(`watchAdmission: a Stop while the request is on its way waits, and acts once ${name}`, async (t) => {
        let release: () => void = () => {};
        const answered = new Promise<void>((resolve) => {
            release = resolve;
        });

        t.mock.method(globalThis, 'fetch', async () => {
            await answered;

            return answer();
        });

        const changes: StopAction[] = [];
        const controller = new AbortController();
        const admission = watchAdmission(
            { onFrame: () => {} },
            {
                onStopChange: (action) => {
                    changes.push(action);

                    if (action.abort === 'now') {
                        controller.abort();
                    }
                },
            },
        );

        admission.start();

        const running = whileBusy(
            (handlers) => runTurn('conv', 'and in 2021?', handlers, controller.signal),
            admission.handlers,
            controller.signal,
            { sleep: async (_ms, signal) => signal?.throwIfAborted() },
        ).catch((error: Error) => error.name);

        // Stop before the response arrives: no cancel yet, no refund, and
        // the request stays open.
        assert.deepEqual(admission.stop(true), {
            cancel: 'on-admit',
            abort: 'after-grace',
            refunded: false,
        });
        assert.deepEqual(changes, []);

        release();
        await running;

        assert.deepEqual(changes, [change]);
    });
}

test('whileBusy: any other refusal reaches onRefusal once and is not retried', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
        Response.json(
            { error: 'edit_conflict', retry: 'refresh_then_retry', detail: 'stale' },
            { status: 409 },
        ),
    );
    const statuses: number[] = [];

    await whileBusy(
        (handlers) => runTurn('conv', 'hi', handlers),
        {
            onFrame: () => {},
            onRefusal: (refusal) => {
                statuses.push(refusal.status);

                return true;
            },
        },
        undefined,
        { sleep: async () => assert.fail('no wait') },
    );

    assert.equal(fetch.mock.callCount(), 1);
    assert.deepEqual(statuses, [409]);
});

// The harness's answer for a conversation id its store does not hold
// (`_unknown_conversation_response`), and the proxy's own problem documents.
const unknownConversation = {
    error: 'not_found',
    retry: 'do_not_retry',
    detail: "no conversation 'conv'",
    pointer: '/conversation_id',
};
const proxyProblem = (status: number, code: string, headers: Record<string, string> = {}) =>
    Response.json(
        { status, code, detail: 'proxy text', retryable: false },
        { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
    );
const harnessBusy = (seconds: number) =>
    Response.json(
        {
            error: 'transient_unavailable',
            retry: 'retry_after_delay',
            detail: 'busy',
            retry_after_seconds: seconds,
        },
        { status: 503 },
    );
const stateRead = { conversation_id: 'conv', closed_since: [], closed_total: 0 };

test('readState: a refusal the page acts on is named, any other is null', async (t) => {
    const cases: [string, () => Response, unknown][] = [
        [
            'the harness holds no such conversation',
            () => Response.json(unknownConversation, { status: 404 }),
            {
                refusal: 'session_gone',
                http: {
                    status: 404,
                    detail: unknownConversation.detail,
                    error: unknownConversation,
                },
            },
        ],
        [
            'a guest on a conversation an account owns',
            () => proxyProblem(401, 'sign_in_required'),
            {
                refusal: 'sign_in_required',
                http: {
                    status: 401,
                    detail: null,
                    error: null,
                    proxy: {
                        code: 'sign_in_required',
                        upstreamStatus: null,
                        retryAfterSeconds: null,
                    },
                },
            },
        ],
        [
            "the proxy's 404 for another account's conversation",
            () => proxyProblem(404, 'not_found'),
            null,
        ],
        [
            'a card the harness holds no block for',
            () =>
                Response.json(
                    { ...unknownConversation, pointer: '/operations/component_id' },
                    { status: 404 },
                ),
            null,
        ],
        ['a read', () => Response.json(stateRead), stateRead],
    ];

    for (const [name, respond, expected] of cases) {
        await t.test(name, async (t) => {
            t.mock.method(globalThis, 'fetch', async () => respond());

            assert.deepEqual(
                await readState('conv', 0, undefined, async () => assert.fail('no wait')),
                expected,
            );
        });
    }
});

test('readState: a 503 transient_unavailable is asked again after its wait, a bounded number of times', async (t) => {
    await t.test('the harness, then a read', async (t) => {
        const answers = [
            harnessBusy(2),
            proxyProblem(503, 'transient_unavailable', { 'Retry-After': '5' }),
            Response.json(stateRead),
        ];
        const fetch = t.mock.method(globalThis, 'fetch', async () => answers.shift()!);
        const waits: number[] = [];

        assert.deepEqual(
            await readState('conv', 0, undefined, async (ms) => {
                waits.push(ms);
            }),
            stateRead,
        );
        assert.equal(fetch.mock.callCount(), 3);
        assert.deepEqual(waits, [2000, 5000]);
    });

    await t.test('busy on every attempt', async (t) => {
        const fetch = t.mock.method(globalThis, 'fetch', async () => harnessBusy(1));

        assert.equal(await readState('conv', 0, undefined, async () => {}), null);
        assert.equal(fetch.mock.callCount(), STATE_READ_ATTEMPTS);
    });
});

test('mutateComposition: a refusal rejects with a CompositionRefusal, and says whether no block or a moved canvas refused it', async (t) => {
    const noBlock = {
        error: 'not_found',
        retry: 'refresh_then_retry',
        detail: "no block 'cmp_1' in the composition",
        pointer: '/operations/component_id',
    };
    const moved = {
        error: 'edit_conflict',
        retry: 'refresh_then_retry',
        detail: 'expected revision 3, the composition is at 4',
    };
    const cases: [string, Response, boolean, boolean][] = [
        ['no block', Response.json(noBlock, { status: 404 }), true, false],
        ['no conversation', Response.json(unknownConversation, { status: 404 }), false, false],
        ["the proxy's 404", proxyProblem(404, 'not_found'), false, false],
        ['a moved canvas', Response.json(moved, { status: 409 }), false, true],
    ];

    for (const [name, response, refusedBlock, stale] of cases) {
        await t.test(name, async (t) => {
            t.mock.method(globalThis, 'fetch', async () => response);

            const refusal = await mutateComposition('conv', [
                { op: 'remove', component_id: 'cmp_1' },
            ]).then(
                () => assert.fail('the edit was refused'),
                (error: unknown) => error,
            );

            assert.ok(refusal instanceof CompositionRefusal);
            assert.equal(refusal.status, response.status);
            assert.equal(isNoBlock(refusal), refusedBlock);
            assert.equal(isStaleRevision(refusal), stale);
        });
    }
});

// A turn route whose stream the test writes: `write` sends a frame, `end`
// closes the stream. The response names turn `turnIndex`.
const heldHarness = (t: TestContext, { turnIndex = 3 } = {}) => {
    const encoder = new TextEncoder();
    let stream: ReadableStreamDefaultController<Uint8Array> | null = null;
    const fetch = t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        if (String(input) === '/api/studio/cancel') {
            return new Response(null, { status: 204 });
        }

        return new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    stream = controller;
                },
            }),
            { headers: { 'x-dfo-turn-index': String(turnIndex) } },
        );
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

    return {
        fetch,
        settle,
        write: async (frame: object) => {
            stream?.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
            await settle();
        },
        end: () => stream?.close(),
    };
};

test('takeHeldTurn: a held turn is taken once, then answers adopted; an unknown or cancelled one is null', async (t) => {
    heldHarness(t);

    const { token } = startHeldTurn({ message: 'Aid to Ghana' });
    const taken = takeHeldTurn(token);

    assert.equal(taken !== null && taken !== 'adopted' && taken.message, 'Aid to Ghana');
    assert.equal(takeHeldTurn(token), 'adopted');
    assert.equal(takeHeldTurn('never-started'), null);

    const cancelled = startHeldTurn({ message: 'Aid to Ghana' });

    await cancelled.cancel();
    assert.equal(takeHeldTurn(cancelled.token), null);
});

test('takeHeldTurn: an adopted turn replays what it heard, hears the rest live, and is let go once it settles', async (t) => {
    const harness = heldHarness(t, { turnIndex: 3 });
    const { token } = startHeldTurn({ message: 'Aid to Ghana' });

    await harness.write({ event: 'turn.started', seq: 1 });

    const taken = takeHeldTurn(token);

    assert.ok(taken && taken !== 'adopted');

    const heard: string[] = [];
    const run = taken.run(
        {
            onTurnIndex: (index) => heard.push(`turn ${index}`),
            onFrame: (frame) => heard.push(`${frame.event} ${frame.seq}`),
        },
        new AbortController().signal,
    );

    assert.deepEqual(heard, ['turn 3', 'turn.started 1']);
    assert.notEqual(heldTurnListener(token), null);

    await harness.write({ event: 'done', seq: 2 });
    harness.end();
    await run;

    assert.deepEqual(heard, ['turn 3', 'turn.started 1', 'done 2']);
    assert.equal(heldTurnListener(token), null);
    assert.equal(takeHeldTurn(token), 'adopted');
});

test('takeHeldTurn: a refusal heard before adoption reaches the adopting onRefusal, and no error frame', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ code: 'rate_limited', upstream_status: null }, { status: 429 }),
    );

    const { token } = startHeldTurn({ message: 'Aid to Ghana' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const taken = takeHeldTurn(token);
    const refusals: number[] = [];
    const frames: string[] = [];

    assert.ok(taken && taken !== 'adopted');
    await taken.run(
        {
            onFrame: (frame) => frames.push(frame.event),
            onRefusal: (refusal) => refusals.push(refusal.status) > 0,
        },
        new AbortController().signal,
    );

    assert.deepEqual(refusals, [429]);
    assert.deepEqual(frames, []);
});

// Studio's arrival and Get Data's held turn both send these members.
test('handoffExtras carries the seeds and the prompt source a handover has, and nothing it lacks', () => {
    const seeds = [{ spec: { kind: 'stand-in' } }] as unknown as Seed[];

    assert.deepEqual(handoffExtras(seeds, 'search_example'), {
        seed_spec: seeds,
        prompt_source: 'search_example',
    });
    assert.deepEqual(handoffExtras(null, undefined), {});
});

test('startHeldTurn posts the request runTurn posts for the same members', async (t) => {
    const { fetch } = heldHarness(t);
    const extras: TurnExtras = { prompt_source: 'search_example', surface: 'studio' };

    const { token } = startHeldTurn({ message: 'Aid to Ghana', extras });
    const taken = takeHeldTurn(token, { source: 'search_example' });

    assert.ok(taken && taken !== 'adopted');
    void runTurn(taken.conversationId, 'Aid to Ghana', { onFrame: () => {} }, undefined, extras);

    const [held, own] = fetch.mock.calls.map((call) => call.arguments[1] as RequestInit);

    assert.deepEqual(JSON.parse(held?.body as string), JSON.parse(own?.body as string));
    assert.deepEqual(held?.headers, own?.headers);
});

test('startHeldTurn: a cancel before the harness names the turn waits for it and names it', async (t) => {
    const harness = heldHarness(t, { turnIndex: 4 });
    const { cancel } = startHeldTurn({ message: 'Aid to Ghana' });

    await cancel();

    const sent = harness.fetch.mock.calls
        .filter((call) => call.arguments[0] === '/api/studio/cancel')
        .map((call) => JSON.parse((call.arguments[1] as RequestInit).body as string));

    assert.deepEqual(
        sent.map((body) => body.turn_index),
        [4],
    );
});

// The conversation of each turn `fetch` posted and of each cancel it sent,
// in order, and whether each cancel was keepalive.
const heldPosts = (fetch: ReturnType<typeof heldHarness>['fetch']) => {
    const posts = fetch.mock.calls.map((call) => {
        const init = call.arguments[1] as RequestInit;
        const body = JSON.parse(init.body as string) as { conversation_id: string };

        return { route: call.arguments[0], conversation: body.conversation_id, init };
    });

    return {
        turns: posts
            .filter((post) => post.route === '/api/studio/turn')
            .map((post) => post.conversation),
        cancels: posts
            .filter((post) => post.route === '/api/studio/cancel')
            .map((post) => ({
                conversation: post.conversation,
                keepalive: post.init.keepalive === true,
            })),
    };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('startHeldTurn: a moved turn Studio has not run in adoptLimitMs cancels itself, taken or not', async (t) => {
    const harness = heldHarness(t);
    const untaken = startHeldTurn({ message: 'Aid to Ghana', adoptLimitMs: 20 });
    const reserved = startHeldTurn({ message: 'Aid to Ghana', adoptLimitMs: 20 });
    const adopted = startHeldTurn({ message: 'Aid to Ghana', adoptLimitMs: 20 });

    untaken.moved();
    reserved.moved();
    adopted.moved();
    await harness.settle();
    assert.notEqual(takeHeldTurn(reserved.token), null);

    const taken = takeHeldTurn(adopted.token);

    assert.ok(taken && taken !== 'adopted');
    void taken.run({ onFrame: () => {} }, new AbortController().signal);
    await wait(80);

    const { turns, cancels } = heldPosts(harness.fetch);

    assert.deepEqual(
        cancels.toSorted((a, b) => turns.indexOf(a.conversation) - turns.indexOf(b.conversation)),
        [
            { conversation: turns[0], keepalive: false },
            { conversation: turns[1], keepalive: false },
        ],
    );
    assert.equal(takeHeldTurn(untaken.token), null);
    harness.end();
});

test('startHeldTurn: onSpent runs once for a turn cancelled before Studio runs it, and never for one it runs', async (t) => {
    const harness = heldHarness(t);
    let spent = 0;
    const onSpent = () => {
        spent += 1;
    };

    // Cancelled twice: counted once, at the first cancel.
    const stayed = startHeldTurn({ message: 'Aid to Ghana', onSpent });
    const first = stayed.cancel();

    assert.equal(spent, 1);
    await Promise.all([first, stayed.cancel({ keepalive: true })]);
    assert.equal(spent, 1);

    // Taken and then cancelled by Studio (its gate declined it).
    const declined = takeHeldTurn(startHeldTurn({ message: 'Aid to Ghana', onSpent }).token);

    assert.ok(declined && declined !== 'adopted');
    await declined.cancel();
    assert.equal(spent, 2);

    // Run: a later cancel does nothing.
    const held = startHeldTurn({ message: 'Aid to Ghana', onSpent });
    const ran = takeHeldTurn(held.token);

    assert.ok(ran && ran !== 'adopted');
    void ran.run({ onFrame: () => {} }, new AbortController().signal);
    await Promise.all([ran.cancel(), held.cancel()]);
    assert.equal(spent, 2);
    assert.deepEqual(
        heldPosts(harness.fetch).cancels.map(({ conversation }) => conversation),
        heldPosts(harness.fetch).turns.slice(0, 2),
    );
    harness.end();
});

test('takeHeldTurn: a turn started for another seed token or prompt source is cancelled and answers null', async (t) => {
    const harness = heldHarness(t);
    let spent = 0;
    const onSpent = () => {
        spent += 1;
    };
    const extras: TurnExtras = { prompt_source: 'search_example' };
    const seeds = startHeldTurn({ message: 'Aid to Ghana', extras, seedToken: 's1', onSpent });
    const source = startHeldTurn({ message: 'Aid to Ghana', extras, seedToken: 's1', onSpent });
    const match = startHeldTurn({ message: 'Aid to Ghana', extras, seedToken: 's1', onSpent });

    assert.equal(takeHeldTurn(seeds.token, { seedToken: 's2', source: 'search_example' }), null);
    assert.equal(takeHeldTurn(source.token, { seedToken: 's1' }), null);
    assert.equal(spent, 2);
    assert.notEqual(takeHeldTurn(match.token, { seedToken: 's1', source: 'search_example' }), null);
    await harness.settle();
    assert.equal(heldPosts(harness.fetch).cancels.length, 2);
    assert.equal(spent, 2);
});

// The registry listens on the first window it sees, so one test covers
// every pagehide case.
test('startHeldTurn: pagehide cancels every turn Studio has not run, with keepalive, and a cancel waiting on the turn index goes with keepalive too', async (t) => {
    const harness = heldHarness(t);
    const page = new EventTarget();

    Object.defineProperty(globalThis, 'window', { value: page, configurable: true });
    t.after(() => Reflect.deleteProperty(globalThis, 'window'));

    const untaken = startHeldTurn({ message: 'Aid to Ghana' });
    const taken = startHeldTurn({ message: 'Aid to Ghana' });
    const waiting = startHeldTurn({ message: 'Aid to Ghana' });
    const adopted = takeHeldTurn(taken.token);

    assert.ok(adopted && adopted !== 'adopted');
    void adopted.run({ onFrame: () => {} }, new AbortController().signal);

    // Cancelled before the harness names the turn, then the page goes.
    const cancelled = waiting.cancel();

    page.dispatchEvent(new Event('pagehide'));
    await cancelled;
    await harness.settle();

    const { turns, cancels } = heldPosts(harness.fetch);

    // Earlier tests leave turns in the registry, which the pagehide cancels
    // too.
    assert.deepEqual(
        cancels
            .filter(({ conversation }) => turns.includes(conversation))
            .toSorted((a, b) => turns.indexOf(a.conversation) - turns.indexOf(b.conversation)),
        [
            { conversation: turns[0], keepalive: true },
            { conversation: turns[2], keepalive: true },
        ],
    );
    assert.equal(takeHeldTurn(untaken.token), null);
    assert.equal(takeHeldTurn(waiting.token), null);
});
