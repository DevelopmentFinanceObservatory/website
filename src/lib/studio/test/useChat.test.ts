/**
 * `useChat`, driven through hookRuntime.ts against a fake harness: the owed
 * removals a reopened conversation sends again, and what the page does with
 * the harness's answers. The hook is bundled with esbuild (about a second),
 * with `react` aliased to hookRuntime.ts and `@` to `src`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test, type TestContext } from 'node:test';

import { build } from 'esbuild';

import type {
    ChatSnapshot,
    useChat as UseChat,
} from '../../../components/organisms/Studio/hooks/useChat.ts';
import { canvasWidgetsOf } from '../../chat/canvas.ts';
import { OWED_RETRY_MS } from '../owedRemovals.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated } from '../wire.ts';
import type { renderHook as RenderHook } from './hookRuntime.ts';

const REPO = join(import.meta.dirname, '../../../..');

let out: string;
let useChat: typeof UseChat;
let renderHook: typeof RenderHook;

before(async () => {
    out = await mkdtemp(join(tmpdir(), 'use-chat-'));

    const file = join(out, 'useChat.mjs');

    await build({
        stdin: {
            contents: [
                "export { useChat } from '@/components/organisms/Studio/hooks/useChat';",
                "export { renderHook } from './src/lib/studio/test/hookRuntime.ts';",
            ].join('\n'),
            resolveDir: REPO,
            loader: 'ts',
        },
        absWorkingDir: REPO,
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: file,
        alias: { '@': './src', react: './src/lib/studio/test/hookRuntime.ts' },
        logLevel: 'error',
    });

    ({ useChat, renderHook } = await import(pathToFileURL(file).href));
});

after(async () => {
    await rm(out, { recursive: true, force: true });
});

type Block = { id: string; revision: number };

/**
 * A harness for one conversation: its composition at `revision` holding
 * `blocks`, its state route, and its composition route, which refuses an
 * edit sent against another revision (409 `edit_conflict`) and a remove of
 * a card it lacks (404 no block). `beforeEdit` runs before each edit
 * lands, as another writer would. `stateFails` answers the state route 500,
 * and the route starts failing after `failStateAfter` reads. The first
 * `busyEdits` edits are answered busy (409 `transient_unavailable`), as
 * while a turn runs. With `sessionGone`, every edit is answered as for a
 * conversation the harness no longer holds (404 at `/conversation_id`).
 */
const fakeHarness = ({
    revision,
    blocks,
    beforeEdit,
    failStateAfter,
    busyEdits = 0,
    sessionGone = false,
}: {
    revision: number;
    blocks: Block[];
    beforeEdit?: (harness: { revision: number; blocks: Block[] }, edit: number) => void;
    failStateAfter?: number;
    busyEdits?: number;
    sessionGone?: boolean;
}) => {
    const edits: { remove: string; expected?: number; composition?: string }[] = [];
    const harness = {
        revision,
        blocks: [...blocks],
        stateFails: false,
        edits: edits,
        reads: 0,
    };
    const manifest = () => ({
        composition_id: 'cps_1',
        revision: harness.revision,
        actor: 'user',
        blocks: harness.blocks.map((block) => ({
            component_id: block.id,
            revision: block.revision,
            type: 'line_chart',
            title: block.id,
        })),
        counts: {
            all: harness.blocks.length,
            stats: 0,
            charts: harness.blocks.length,
            tables: 0,
            notes: 0,
        },
    });
    const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

        if (url.startsWith('/api/studio/state')) {
            harness.reads += 1;

            const fails = harness.stateFails;

            if (harness.reads === failStateAfter) {
                harness.stateFails = true;
            }

            return fails
                ? new Response('{}', { status: 500 })
                : Response.json({
                      conversation_id: 'conv_1',
                      turn: null,
                      closed_since: [],
                      closed_total: 0,
                      manifest: manifest(),
                  });
        }

        if (url === '/api/studio/composition') {
            const body = JSON.parse(String(init?.body));
            const id: string = body.operations[0].component_id;

            beforeEdit?.(harness, harness.edits.length);
            harness.edits.push({
                remove: id,
                expected: body.expected_revision,
                composition: body.composition_id,
            });

            if (sessionGone) {
                return Response.json(
                    {
                        error: 'not_found',
                        retry: 'do_not_retry',
                        detail: "no conversation 'conv_1'",
                        pointer: '/conversation_id',
                    },
                    { status: 404 },
                );
            }

            if (harness.edits.length <= busyEdits) {
                return Response.json(
                    {
                        error: 'transient_unavailable',
                        retry: 'retry_after',
                        retry_after_seconds: 1,
                        detail: 'a turn is running',
                    },
                    { status: 409 },
                );
            }

            if (
                body.expected_revision !== undefined &&
                body.expected_revision !== harness.revision
            ) {
                return Response.json(
                    {
                        error: 'edit_conflict',
                        retry: 'refresh_then_retry',
                        detail: 'the composition moved',
                    },
                    { status: 409 },
                );
            }

            if (!harness.blocks.some((block) => block.id === id)) {
                return Response.json(
                    {
                        error: 'not_found',
                        retry: 'refresh_then_retry',
                        detail: `no block '${id}' in the composition`,
                        pointer: '/operations/component_id',
                    },
                    { status: 404 },
                );
            }

            harness.blocks = harness.blocks.filter((block) => block.id !== id);
            harness.revision += 1;

            return Response.json(manifest());
        }

        return new Response('{}', { status: 404 });
    };

    return { harness, fetch };
};

// A save from before manifest pins that hid `removed` among `ids`, all
// harness cards of composition cps_1 at `revision`, each at card revision 1.
const pinlessSave = (revision: number, ids: string[], removed: string[]): ChatSnapshot => ({
    sessionId: 'conv_1',
    messages: [],
    widgets: ids.map((id) => ({
        kind: 'chart',
        id,
        chartType: 'line',
        title: id,
        categories: [],
        series: [],
        turn: 1,
        ref: { component_id: id, revision: 1 },
    })),
    turnCount: 1,
    canvas: { compositionId: 'cps_1', revision, ids },
    removedIds: removed,
});

// Reopen `saved` on a page with the harness's fetch, and let it settle.
const reopen = async (t: TestContext, saved: ChatSnapshot, fetch: typeof globalThis.fetch) => {
    t.mock.method(globalThis, 'fetch', fetch);
    t.mock.method(console, 'warn', () => {});

    const page = renderHook(() => useChat(undefined, { readsState: true }));

    page.result().hydrate(saved);
    await page.settle();
    page.result().reattach();
    await page.settle(60);

    return page;
};

test('a reopened page sends its owed removals one at a time, each against the revision the last left', async (t) => {
    const { harness, fetch } = fakeHarness({
        revision: 5,
        blocks: ['cmp_a', 'cmp_x', 'cmp_y', 'cmp_z'].map((id) => ({ id, revision: 1 })),
    });
    const page = await reopen(
        t,
        pinlessSave(5, ['cmp_a', 'cmp_x', 'cmp_y', 'cmp_z'], ['cmp_x', 'cmp_y', 'cmp_z']),
        fetch,
    );

    assert.deepEqual(harness.edits, [
        { remove: 'cmp_x', expected: 5, composition: 'cps_1' },
        { remove: 'cmp_y', expected: 6, composition: 'cps_1' },
        { remove: 'cmp_z', expected: 7, composition: 'cps_1' },
    ]);
    assert.deepEqual(
        harness.blocks.map((block) => block.id),
        ['cmp_a'],
    );
    assert.deepEqual(page.result().owedRemovals, []);
    page.unmount();
});

test('a resend held busy while the model draws the card again goes against the revision it was picked for', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    const { harness, fetch } = fakeHarness({
        revision: 5,
        blocks: [
            { id: 'cmp_a', revision: 1 },
            { id: 'cmp_x', revision: 1 },
        ],
        busyEdits: 1,
    });
    const page = await reopen(t, pinlessSave(5, ['cmp_a', 'cmp_x'], ['cmp_x']), fetch);

    // The resend went once and waits out the busy answer.
    assert.equal(harness.edits.length, 1);

    // Meanwhile the model draws cmp_x again, and a read brings it, which
    // settles the entry.
    harness.blocks = harness.blocks.map((block) =>
        block.id === 'cmp_x' ? { ...block, revision: 2 } : block,
    );
    harness.revision += 1;
    page.result().reattach();
    await page.settle(60);

    assert.deepEqual(page.result().owedRemovals, []);

    // The resend goes again against revision 5, and the harness refuses it.
    t.mock.timers.tick(1_000);
    await page.settle(60);

    assert.deepEqual(
        harness.edits.map((edit) => edit.expected),
        [5, 5],
    );
    assert.deepEqual(
        harness.blocks.map((block) => block.id),
        ['cmp_a', 'cmp_x'],
    );
    page.unmount();
});

test('a resend whose re-read fails is left for the run and sent again after a wait', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    const { harness, fetch } = fakeHarness({
        revision: 5,
        blocks: [
            { id: 'cmp_a', revision: 1 },
            { id: 'cmp_x', revision: 1 },
        ],
        beforeEdit: (moved, edit) => {
            if (edit === 0) {
                moved.revision += 1;
            }
        },
        failStateAfter: 1,
    });
    const saved = pinlessSave(5, ['cmp_a', 'cmp_x'], ['cmp_x']);

    // Reattach's read lands, then the state route fails. The resend of
    // cmp_x is stale, and its re-read brings nothing.
    const page = await reopen(t, saved, fetch);

    // One send, one failed re-read, and the card waits for the retry.
    assert.equal(harness.edits.length, 1);
    assert.equal(harness.reads, 2);
    assert.deepEqual(
        page.result().owedRemovals.map((entry) => entry.id),
        ['cmp_x'],
    );

    // The retry, once the state route answers, meets the moved canvas once
    // more, reads it, and lands.
    harness.stateFails = false;
    t.mock.timers.tick(2_000);
    await page.settle(60);

    assert.deepEqual(
        harness.edits.map((edit) => edit.expected),
        [5, 5, 6],
    );
    assert.deepEqual(
        harness.blocks.map((block) => block.id),
        ['cmp_a'],
    );
    assert.deepEqual(page.result().owedRemovals, []);
    page.unmount();
});

test('a resend answered as a conversation the harness lost leaves the session and arms no retry', async (t) => {
    const { harness, fetch } = fakeHarness({
        revision: 5,
        blocks: [
            { id: 'cmp_a', revision: 1 },
            { id: 'cmp_x', revision: 1 },
        ],
        sessionGone: true,
    });
    const timers = t.mock.method(globalThis, 'setTimeout');
    const page = await reopen(t, pinlessSave(5, ['cmp_a', 'cmp_x'], ['cmp_x']), fetch);

    assert.equal(harness.edits.length, 1);
    assert.equal(page.result().canvas, null);
    assert.deepEqual(
        timers.mock.calls.filter((call) => call.arguments[1] === OWED_RETRY_MS),
        [],
    );
    page.unmount();
});

test('a picked example names its source on its own turn request alone, queued or not', async (t) => {
    const bodies: Record<string, unknown>[] = [];
    let endFirst = () => {};

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).startsWith('/api/studio/turn')) {
            return new Response('{}', { status: 404 });
        }

        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

        const done = 'data: {"event":"done","seq":1,"trace_id":"t"}\n\n';

        if (bodies.length > 1) {
            return new Response(done);
        }

        // The first turn runs until the test ends it, so the next two queue.
        return new Response(
            new ReadableStream({
                start(controller) {
                    endFirst = () => {
                        controller.enqueue(new TextEncoder().encode(done));
                        controller.close();
                    };
                },
            }),
        );
    });
    t.mock.method(console, 'warn', () => {});

    const page = renderHook(() => useChat());

    page.result().send('Compare remittances', undefined, undefined, undefined, 'example');
    await page.settle();
    page.result().send('my own question');
    page.result().send('What data is available?', undefined, undefined, undefined, 'availability');
    await page.settle();
    endFirst();
    await page.settle(60);

    assert.deepEqual(
        bodies.map((body) => [body['message'], body['prompt_source']]),
        [
            ['Compare remittances', 'example'],
            ['my own question', undefined],
            ['What data is available?', 'availability'],
        ],
    );
    page.unmount();
});

test('a card unit change writes its prompt marked edit, a question does not, and a reopened save keeps the mark', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 404 }));
    t.mock.method(console, 'warn', () => {});
    t.mock.method(console, 'error', () => {});

    const page = renderHook(() => useChat());

    page.result().applyUnit({
        title: 'ODA',
        offer: {
            currencies: [{ code: 'USD', name: 'US dollars', prices: ['current', 'constant'] }],
            presets: [],
            start: { currency: 'USD', prices: 'current' },
        },
        request: {
            component_id: 'cmp_1',
            spec_id: 'spec_1',
            turn: 1,
            unit: { currency: 'USD', prices: 'constant', base_year: 2023 },
        },
    });
    await page.settle(60);
    page.result().send('What about Kenya?');
    await page.settle(60);

    const prompts = page.result().messages.filter((message) => message.role === 'user');

    assert.deepEqual(
        prompts.map((message) => message.edit),
        [{ card: 'cmp_1', row: 'unit' }, undefined],
    );

    page.result().hydrate({
        sessionId: 'conv_1',
        messages: [
            {
                role: 'user',
                text: 'Constant 2023 US dollars',
                edit: { card: 'cmp_1', row: 'unit' },
            },
            { role: 'bot', text: '' },
        ],
        widgets: [],
        turnCount: 1,
    });
    await page.settle();

    const [reopened] = page.result().messages;

    assert.deepEqual(reopened?.role === 'user' && reopened.edit, { card: 'cmp_1', row: 'unit' });
    page.unmount();
});

test('a card redrawn under a new id is on the held canvas before the manifest frame names it', async (t) => {
    const created = JSON.parse(
        readFileSync(
            new URL('./fixtures/event-19-component-unit-change.json', import.meta.url),
            'utf8',
        ),
    ) as ComponentCreated;
    const old = created.replaces ?? '';
    const encoder = new TextEncoder();

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        if (!String(input).startsWith('/api/studio/turn')) {
            return new Response('{}', { status: 404 });
        }

        // The card arrives and the stream stays open, so no manifest follows.
        return new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(created)}\n\n`));
                },
            }),
            { headers: { 'x-dfo-turn-index': '2' } },
        );
    });
    t.mock.method(console, 'warn', () => {});

    const page = renderHook(() => useChat());
    const oldCard = widgetFromComponent({ ...created, component_id: old, replaces: null });

    assert.ok(oldCard);
    page.result().hydrate({
        sessionId: 'conv_1',
        messages: [
            { role: 'user', text: 'Q', turn: 1, harnessTurn: 1 },
            { role: 'bot', text: 'A' },
        ],
        widgets: [{ ...oldCard, turn: 1 }],
        turnCount: 1,
        canvas: { compositionId: 'cps_1', revision: 1, ids: [old], pinned: [] },
    });
    await page.settle();
    page.result().send('Make it constant prices');
    await page.settle(60);

    const { canvas, widgets } = page.result();
    const shown = canvasWidgetsOf({ widgets, pinnedIds: [], removedIds: [], canvas }).map(
        ({ id }) => id,
    );

    assert.deepEqual(shown, [created.component_id]);
    page.unmount();
});

// A card with an offer of places, as a reopened conversation holds it.
const placesCard = () => {
    const created = JSON.parse(
        readFileSync(
            new URL('./fixtures/event-06-component-created.json', import.meta.url),
            'utf8',
        ),
    ) as ComponentCreated;
    const widget = widgetFromComponent({
        ...created,
        card_changes: {
            spec_id: 'spec_1',
            places: [
                {
                    role: 'destination',
                    multiple: false,
                    chosen: [{ id: 'country/ETH', label: 'Ethiopia' }],
                },
            ],
        },
    });

    assert.ok(widget && widget.kind !== 'text');

    return { ...widget, turn: 1 };
};

test('a card change of places sends apply_change, marks its prompt, and only a stale refusal clears the offer', async (t) => {
    for (const [status, constraint, cleared] of [
        [422, 'scope_choice_stale', true],
        [422, 'change_not_offered', false],
        [422, 'change_no_data', false],
        [503, 'place_options_unavailable', false],
    ] as const) {
        const bodies: Record<string, unknown>[] = [];

        t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
            if (!String(input).startsWith('/api/studio/turn')) {
                return new Response('{}', { status: 404 });
            }

            bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

            return Response.json(
                {
                    error: status === 503 ? 'transient_unavailable' : 'constraint_violation',
                    retry: status === 503 ? 'retry_after_delay' : 'do_not_retry',
                    detail: `Refused: ${constraint}.`,
                    constraint_id: constraint,
                    pointer: '/apply_change',
                },
                { status },
            );
        });
        t.mock.method(console, 'warn', () => {});
        t.mock.method(console, 'error', () => {});

        const page = renderHook(() => useChat());
        const card = placesCard();

        page.result().hydrate({
            sessionId: 'conv_1',
            messages: [
                { role: 'user', text: 'Q', turn: 1, harnessTurn: 1 },
                { role: 'bot', text: 'A' },
            ],
            widgets: [card],
            turnCount: 1,
        });
        await page.settle();
        page.result().applyChange({
            title: 'Aid',
            row: 'shows',
            role: 'destination',
            label: 'Recipient',
            words: 'Kenya',
            request: {
                component_id: card.id,
                spec_id: 'spec_1',
                change: { kind: 'places', role: 'destination', entities: ['country/KEN'] },
            },
        });
        await page.settle(60);

        const { messages, widgets } = page.result();
        const held = widgets.find((widget) => widget.id === card.id);

        assert.deepEqual(bodies[0]?.['apply_change'], {
            component_id: card.id,
            spec_id: 'spec_1',
            change: { kind: 'places', role: 'destination', entities: ['country/KEN'] },
        });
        assert.equal(bodies[0]?.['message'], undefined);
        assert.deepEqual(
            messages.slice(-2).map((message) => [message.role, message.text]),
            [
                ['user', 'Kenya'],
                ['bot', `_Refused: ${constraint}._`],
            ],
            constraint,
        );
        const prompt = messages.at(-2);

        assert.deepEqual(prompt?.role === 'user' && prompt.edit, {
            card: card.id,
            row: 'shows',
            role: 'destination',
        });
        assert.equal(held?.kind !== 'text' && held?.cardChanges === undefined, cleared, constraint);
        page.unmount();
        t.mock.restoreAll();
    }
});

test('a card role’s places are read once, again after a failure, and anew once the card is replaced, whose replacement keeps its plan step', async (t) => {
    const created = JSON.parse(
        readFileSync(
            new URL('./fixtures/event-06-component-created.json', import.meta.url),
            'utf8',
        ),
    ) as ComponentCreated;
    // The redrawn card's frame names no plan, as an older harness's does.
    const redrawn: ComponentCreated = {
        ...created,
        component_id: 'cmp_2',
        replaces: created.component_id,
        created_from: { step_id: 's2' },
    };
    const reads: string[] = [];
    let fail = true;

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://site.test');

        if (url.pathname === '/api/studio/turn') {
            return new Response(
                [redrawn, { event: 'done', seq: 9, trace_id: 't' }]
                    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
                    .join(''),
                { headers: { 'x-dfo-turn-index': '2' } },
            );
        }

        if (url.pathname !== '/api/studio/places') {
            return new Response('{}', { status: 404 });
        }

        reads.push(url.searchParams.get('component_id') ?? '');

        if (fail) {
            fail = false;

            return Response.json({ error: 'transient_unavailable' }, { status: 503 });
        }

        return Response.json({
            component_id: url.searchParams.get('component_id'),
            role: 'destination',
            options: [{ id: 'country/KEN', label: 'Kenya' }],
            truncated: false,
        });
    });
    t.mock.method(console, 'warn', () => {});

    const page = renderHook(() => useChat());
    const old = widgetFromComponent(created);

    assert.ok(old);
    page.result().hydrate({
        sessionId: 'conv_1',
        messages: [
            { role: 'user', text: 'Q', turn: 1, harnessTurn: 1 },
            { role: 'bot', text: 'A' },
        ],
        widgets: [{ ...old, turn: 1 }],
        turnCount: 1,
    });
    await page.settle();

    const { placeOptions } = page.result();
    const id = created.component_id;
    const first = await placeOptions(id, 'destination');
    const second = await placeOptions(id, 'destination');
    const third = await placeOptions(id, 'destination');

    assert.equal(first.kind, 'failed');
    assert.equal(second.kind, 'options');
    assert.equal(third, second);
    assert.deepEqual(reads, [id, id]);

    page.result().send('Redraw it');
    await page.settle(60);
    await placeOptions(id, 'destination');

    assert.deepEqual(reads, [id, id, id]);

    const replacement = page.result().widgets.find((widget) => widget.id === 'cmp_2');

    assert.deepEqual(replacement?.kind !== 'text' && replacement?.planStep, {
        plan_version_id: 'plan_01j9ze2k7c',
        plan_step_id: 's3',
    });
    page.unmount();
});

test('a page reloaded while a card change runs rebuilds its prompt with the edit mark', async (t) => {
    const fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);

        if (url.startsWith('/api/studio/state')) {
            return Response.json({
                conversation_id: 'conv_1',
                turn: {
                    index: 2,
                    status: 'running',
                    trace_id: 'tr_2',
                    user_message: 'Uganda',
                    card_change: {
                        component_id: 'cmp_1',
                        kind: 'places',
                        role: 'destination',
                    },
                    lease_live: false,
                },
                closed_since: [],
                closed_total: 1,
            });
        }

        if (url === '/api/studio/resume') {
            return new Response('data: {"event":"done","seq":1,"trace_id":"tr_2"}\n\n', {
                headers: { 'x-dfo-turn-index': '2' },
            });
        }

        return new Response('{}', { status: 404 });
    };
    const page = await reopen(
        t,
        {
            sessionId: 'conv_1',
            messages: [
                { role: 'user', text: 'Aid to Kenya', harnessTurn: 1, turn: 1 },
                { role: 'bot', text: 'Here.' },
            ],
            widgets: [],
            turnCount: 1,
        },
        fetch,
    );
    const prompt = page.result().messages[2];

    assert.deepEqual(prompt?.role === 'user' && [prompt.text, prompt.edit], [
        'Uganda',
        { card: 'cmp_1', row: 'shows', role: 'destination' },
    ]);
    page.unmount();
});

test('an answer to a clarifying question keeps the question it answered', async (t) => {
    // The harness's two-question pause (`event-14`).
    const ask = readFileSync(
        new URL('./fixtures/event-14-elicitation-questions.json', import.meta.url),
        'utf8',
    );

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === '/api/studio/turn') {
            return new Response(`data: ${JSON.stringify(JSON.parse(ask))}\n\n`, {
                headers: { 'x-dfo-turn-index': '1' },
            });
        }

        if (url === '/api/studio/interrupt') {
            return new Response('data: {"event":"done","seq":9,"trace_id":"t"}\n\n', {
                headers: { 'x-dfo-turn-index': '1' },
            });
        }

        return new Response('{}', { status: 404 });
    });
    t.mock.method(console, 'warn', () => {});

    const page = renderHook(() => useChat());

    page.result().send('How much aid went to Kenya?');
    await page.settle(60);
    page.result().answerClarify({
        q1: { kind: 'option', option_id: 'spec_4d5e6f7a33333333' },
        q2: { kind: 'option', option_id: 'o2' },
    });
    await page.settle(60);

    const answer = page
        .result()
        .messages.find((message) => message.role === 'user' && message.answer);

    assert.equal(
        answer?.role === 'user' && answer.asked,
        'How should the aid be counted? Should the amounts be in current or constant prices?',
    );
    page.unmount();
});
