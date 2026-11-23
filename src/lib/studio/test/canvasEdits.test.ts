import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CANVAS_EDIT_TURN_WAIT_MS,
    createCanvasEdits,
    editedCanvasCards,
    pinEdit,
    refusedRemoves,
    shownCanvas,
    shownPins,
    withCardsSent,
    withCardsSettled,
    withHarnessPins,
    withPinsSent,
    withPinsSettled,
} from '../canvasEdits.ts';
import { sessionLeftCards, takeManifest, type CanvasBaseline } from '../composition.ts';
import { CompositionRefusal } from '../studioClient.ts';
import type { CompositionManifest, MutationOperation } from '../wire.ts';

const remove: MutationOperation[] = [{ op: 'remove', component_id: 'cmp_1' }];
const add: MutationOperation[] = [{ op: 'add', component_id: 'cmp_1' }];
const manifest: CompositionManifest = {
    composition_id: 'cps_1',
    revision: 1,
    actor: 'user',
    blocks: [],
    counts: { all: 0, stats: 0, charts: 0, tables: 0, notes: 0 },
};

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });

    return { promise, resolve };
};

test('a refused or failed edit is reported and releases the next edit', async () => {
    for (const rejection of [false, true]) {
        const failures: unknown[] = [];
        let calls = 0;
        const edits = createCanvasEdits({
            mutate: async () => {
                calls += 1;
                if (calls === 1) {
                    if (rejection) throw new Error('offline');
                    return null;
                }
                return manifest;
            },
            onManifest: () => {},
            onFailure: (_operations, error) => {
                failures.push(error);
            },
        });

        // Each edit says whether the harness answered it with a manifest.
        assert.equal(await edits.enqueue('session', remove), false);
        assert.equal(await edits.enqueue('session', add), true);
        assert.equal(calls, 2);
        assert.equal(failures.length, 1);
    }
});

test('switching conversations bypasses a hung edit and ignores its late completion', async () => {
    const old = deferred<CompositionManifest | null>();
    const calls: string[] = [];
    const received: CompositionManifest[] = [];
    const edits = createCanvasEdits({
        mutate: (session) => {
            calls.push(session);
            return session === 'old' ? old.promise : Promise.resolve(manifest);
        },
        onManifest: (value) => received.push(value),
        onFailure: () => assert.fail('old failures must not touch the new conversation'),
    });
    const oldPending = edits.enqueue('old', remove);
    const oldQueued = edits.enqueue('old', add);

    await Promise.resolve();
    edits.reset();
    await edits.enqueue('new', add);
    assert.deepEqual(calls, ['old', 'new']);
    assert.equal(received.length, 1);
    old.resolve(null);
    await Promise.all([oldPending, oldQueued]);
    assert.deepEqual(calls, ['old', 'new', 'old']);
    assert.equal(received.length, 1);
});

test('reopening the same session preserves ordering behind its old pending edits', async () => {
    const old = deferred<CompositionManifest | null>();
    const calls: string[] = [];
    const received: number[] = [];
    let count = 0;
    const edits = createCanvasEdits({
        mutate: async (_session, operations) => {
            calls.push(operations[0].op);
            count += 1;
            return count === 1 ? old.promise : { ...manifest, revision: count };
        },
        onManifest: (value) => received.push(value.revision),
        onFailure: () => {},
    });
    const pending = edits.enqueue('same', remove);
    const queued = edits.enqueue('same', [{ op: 'pin', component_id: 'cmp_1' }]);

    await Promise.resolve();
    edits.reset();
    const reopened = edits.enqueue('same', add);
    await Promise.resolve();
    assert.deepEqual(calls, ['remove']);
    old.resolve(manifest);
    await Promise.all([pending, queued, reopened]);
    assert.deepEqual(calls, ['remove', 'pin', 'add']);
    assert.deepEqual(received, [3]);
});

test('an edit refused as busy or briefly unavailable is sent again after the wait it names', async () => {
    const busy = new CompositionRefusal(
        409,
        {
            error: 'transient_unavailable',
            retry: 'retry_after_delay',
            detail: 'busy',
            retry_after_seconds: 4,
        },
        null,
    );
    const unavailable = new CompositionRefusal(503, null, {
        code: 'transient_unavailable',
        upstreamStatus: null,
        retryAfterSeconds: null,
    });
    const final = new CompositionRefusal(
        404,
        { error: 'not_found', retry: 'do_not_retry', detail: 'gone', pointer: '/conversation_id' },
        null,
    );
    const cases: [string, unknown[], number[], unknown][] = [
        ['busy, then answered', [busy, busy, busy, busy, manifest], [4000, 4000, 4000, 4000], null],
        // A busy 409 is sent CANVAS_EDIT_BUSY_ATTEMPTS times in all.
        ['busy throughout', [busy, busy, busy, busy, busy], [4000, 4000, 4000, 4000], busy],
        // Busy answers spend none of the 503 sends.
        [
            'busy, then unavailable',
            [busy, busy, unavailable, unavailable, manifest],
            [4000, 4000, 1000, 1000],
            null,
        ],
        ['unavailable, then answered', [unavailable, manifest], [1000], null],
        // A 503 is sent CANVAS_EDIT_ATTEMPTS times in all.
        [
            'unavailable throughout',
            [unavailable, unavailable, unavailable],
            [1000, 1000],
            unavailable,
        ],
        ['refused for good', [final], [], final],
    ];

    for (const [name, answers, expectedWaits, expectedFailure] of cases) {
        const waits: number[] = [];
        const failures: unknown[] = [];
        const queue = [...answers];
        const edits = createCanvasEdits({
            mutate: async () => {
                const answer = queue.shift();

                if (answer instanceof Error) {
                    throw answer;
                }

                return answer as CompositionManifest;
            },
            onManifest: () => {},
            onFailure: (_operations, error) => failures.push(error),
            sleep: async (ms) => {
                waits.push(ms);
            },
        });

        assert.equal(await edits.enqueue('session', remove), expectedFailure === null, name);
        assert.deepEqual(waits, expectedWaits, name);
        assert.deepEqual(failures, expectedFailure === null ? [] : [expectedFailure], name);
    }
});

test("a busy edit is sent again while the page's own turn runs, then gets the busy sends left", async () => {
    const busy = new CompositionRefusal(
        409,
        {
            error: 'transient_unavailable',
            retry: 'retry_after_delay',
            detail: 'busy',
            retry_after_seconds: 4,
        },
        null,
    );
    // [name, busy answers before the manifest (Infinity: never answered),
    //  sends during the turn, the edit lands]
    const cases: [string, number, number, boolean][] = [
        ['a long turn, then answered', 12, 10, true],
        // The turn ends after 3 sends: 5 more busy sends, then the rollback.
        ['the turn ends, still busy', Infinity, 3, false],
        // A turn that outlasts CANVAS_EDIT_TURN_WAIT_MS stops holding the edit.
        ['the turn never ends', Infinity, Infinity, false],
    ];

    for (const [name, busyAnswers, turnSends, lands] of cases) {
        let clock = 0;
        let sends = 0;
        const failures: unknown[] = [];
        const edits = createCanvasEdits({
            mutate: async () => {
                sends += 1;

                if (sends <= busyAnswers) {
                    throw busy;
                }

                return manifest;
            },
            onManifest: () => {},
            onFailure: (_operations, error) => failures.push(error),
            sleep: async (ms) => {
                assert.equal(ms, 4000, name);
                clock += ms;
            },
            ownTurn: () => sends <= turnSends,
            now: () => clock,
        });

        assert.equal(await edits.enqueue('session', remove), lands, name);
        assert.deepEqual(failures, lands ? [] : [busy], name);

        if (!lands) {
            const turnBusy = Number.isFinite(turnSends)
                ? turnSends
                : CANVAS_EDIT_TURN_WAIT_MS / 4000;

            assert.equal(sends, turnBusy + 5, name);
        }
    }
});

test('leaving the conversation ends the wait of an edit to be sent again', async () => {
    const waking = deferred<void>();
    const calls: string[] = [];
    const edits = createCanvasEdits({
        mutate: async (_session, operations) => {
            calls.push(operations[0].op);

            if (operations === remove) {
                throw new CompositionRefusal(
                    409,
                    { error: 'transient_unavailable', retry: 'retry_after_delay', detail: 'busy' },
                    null,
                );
            }

            return manifest;
        },
        onManifest: () => {},
        onFailure: () => assert.fail('a left conversation hears no failure'),
        // A wait that ends when aborted, or else when the test wakes it.
        sleep: (_ms, signal) =>
            new Promise((resolve, reject) => {
                void waking.promise.then(resolve);
                signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
    });
    const pending = edits.enqueue('session', remove);

    await new Promise((resolve) => setTimeout(resolve, 0));
    edits.reset();

    // The next edit of the same session goes out without waiting on it.
    const next = edits.enqueue('session', add);

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls, ['remove', 'add']);
    waking.resolve();
    assert.equal(await pending, false);
    assert.equal(await next, true);
});

test("a harness card's add or remove shows at once, and a refusal rolls it back", () => {
    const canvas: CanvasBaseline = { compositionId: 'cps_1', revision: 3, ids: ['cmp_1', 'cmp_2'] };
    const restore: MutationOperation[] = [{ op: 'add', component_id: 'cmp_3' }];
    const sent = withCardsSent(withCardsSent(new Map(), remove), restore);

    assert.deepEqual(shownCanvas(canvas, sent)?.ids, ['cmp_2', 'cmp_3']);
    // Refused: with nothing in flight the canvas is the manifest's again.
    assert.equal(
        shownCanvas(canvas, withCardsSettled(withCardsSettled(sent, remove), restore)),
        canvas,
    );
    // A remove then an add of the same card in flight show the add.
    assert.deepEqual(
        shownCanvas(canvas, withCardsSent(withCardsSent(new Map(), remove), add))?.ids,
        ['cmp_1', 'cmp_2'],
    );
    // Pins are not card edits.
    assert.equal(shownCanvas(canvas, withCardsSent(new Map(), [pinEdit([], 'cmp_1')])), canvas);

    // With no manifest baseline, the edits show on the cards the page shows.
    const pageIds = ['cmp_1', 'cmp_2', 'text_1'];

    assert.deepEqual(shownCanvas(null, sent, pageIds)?.ids, ['cmp_2', 'text_1', 'cmp_3']);
    assert.equal(shownCanvas(null, new Map(), pageIds), null);
    assert.equal(shownCanvas(null, sent), null);

    // The session gone: the cards turn local as the user left them.
    const widgets = ['cmp_1', 'cmp_2', 'cmp_3'].map((id) => ({ id }));

    assert.deepEqual(sessionLeftCards(shownCanvas(canvas, sent)?.ids ?? null, widgets), {
        shown: ['cmp_2', 'cmp_3'],
        hidden: ['cmp_1'],
    });
    assert.deepEqual(sessionLeftCards(null, widgets, shownCanvas(null, sent, pageIds)?.ids), {
        shown: ['cmp_2', 'cmp_3'],
        hidden: ['cmp_1'],
    });
});

test('only a "no block" refusal names cards the harness does not hold', () => {
    const operations: MutationOperation[] = [...remove, { op: 'pin', component_id: 'cmp_2' }];
    const noBlock = new CompositionRefusal(
        404,
        {
            error: 'not_found',
            retry: 'do_not_retry',
            detail: 'no block',
            pointer: '/operations/component_id',
        },
        null,
    );
    const busy = new CompositionRefusal(
        409,
        { error: 'transient_unavailable', retry: 'retry_after_delay', detail: 'busy' },
        null,
    );

    assert.deepEqual(refusedRemoves(operations, noBlock), ['cmp_1']);

    // Any other failure only rolls the edit back.
    for (const failure of [busy, new Error('offline'), undefined]) {
        assert.deepEqual(refusedRemoves(operations, failure), []);
    }
});

test('with no manifest baseline, the edits show on the cards the page draws at each render', () => {
    const widgets = [{ id: 'cmp_1' }, { id: 'cmp_2' }];
    // The page's rule for a canvas: the held cards, or with none every card.
    const visible = (canvas: CanvasBaseline | null) =>
        canvas ? widgets.filter(({ id }) => canvas.ids.includes(id)) : widgets;
    const ids = () => editedCanvasCards(null, withCardsSent(new Map(), remove), visible);

    assert.deepEqual(
        ids().map(({ id }) => id),
        ['cmp_2'],
    );

    // A running turn draws a card while the remove is in flight.
    widgets.push({ id: 'cmp_3' });
    assert.deepEqual(
        ids().map(({ id }) => id),
        ['cmp_2', 'cmp_3'],
    );

    // With a baseline the manifest decides, and with nothing in flight the
    // page's own rule does.
    const canvas: CanvasBaseline = { compositionId: 'cps_1', revision: 1, ids: ['cmp_1', 'cmp_3'] };

    assert.deepEqual(
        editedCanvasCards(canvas, withCardsSent(new Map(), remove), visible).map(({ id }) => id),
        ['cmp_3'],
    );
    assert.equal(editedCanvasCards(null, new Map(), visible), widgets);
});

test('pinning sends pin, and unpinning a pinned card sends unpin', () => {
    assert.deepEqual(pinEdit([], 'cmp_1'), { op: 'pin', component_id: 'cmp_1' });
    assert.deepEqual(pinEdit(['cmp_1'], 'cmp_1'), { op: 'unpin', component_id: 'cmp_1' });
});

const pinnedManifest = (revision: number, blocks: [string, boolean][]): CompositionManifest => ({
    composition_id: 'cps_1',
    revision,
    actor: 'user',
    blocks: blocks.map(([id, pinned]) => ({
        component_id: id,
        revision: 1,
        type: 'line_chart',
        title: id,
        pinned,
    })),
    counts: { all: blocks.length, stats: 0, charts: blocks.length, tables: 0, notes: 0 },
});

test("a harness card's pin is the manifest's, shown at once and settled by the answer", () => {
    const canvas =
        takeManifest(
            null,
            pinnedManifest(3, [
                ['cmp_a', true],
                ['cmp_b', false],
            ]),
        )?.baseline ?? null;

    assert.deepEqual(shownPins(canvas, new Map()), ['cmp_a']);

    // Pin b: shown at once while the edit is in flight.
    const pin: MutationOperation[] = [{ op: 'pin', component_id: 'cmp_b' }];
    const sent = withPinsSent(new Map(), pin);

    assert.deepEqual(shownPins(canvas, sent), ['cmp_a', 'cmp_b']);

    // The harness refused it: the manifest decides again.
    assert.deepEqual(shownPins(canvas, withPinsSettled(sent, pin)), ['cmp_a']);

    // It accepted it: the answer's manifest holds the pin.
    const answered =
        takeManifest(
            canvas,
            pinnedManifest(4, [
                ['cmp_a', true],
                ['cmp_b', true],
            ]),
        )?.baseline ?? null;

    assert.deepEqual(shownPins(answered, withPinsSettled(sent, pin)), ['cmp_a', 'cmp_b']);
});

test('a pin on a card a turn removed rolls back, and Add brings it back as the manifest says', () => {
    // A turn took cmp_b off; the page pinned it before the manifest arrived.
    const canvas = takeManifest(null, pinnedManifest(5, [['cmp_a', false]]))?.baseline ?? null;
    const pin: MutationOperation[] = [{ op: 'pin', component_id: 'cmp_b' }];
    const failed = withPinsSettled(withPinsSent(new Map(), pin), pin);

    assert.deepEqual(shownPins(canvas, failed), []);

    const added =
        takeManifest(
            canvas,
            pinnedManifest(6, [
                ['cmp_a', false],
                ['cmp_b', false],
            ]),
        )?.baseline ?? null;

    assert.deepEqual(shownPins(added, failed), []);
});

test('a failed Remove of a pinned card leaves it pinned, and two edits settle in turn', () => {
    const canvas = takeManifest(null, pinnedManifest(2, [['cmp_a', true]]))?.baseline ?? null;
    const remove: MutationOperation[] = [{ op: 'remove', component_id: 'cmp_a' }];

    assert.deepEqual(shownPins(canvas, withPinsSettled(withPinsSent(new Map(), remove), remove)), [
        'cmp_a',
    ]);

    // Unpin then pin again: the later edit shows until both have settled.
    const unpin: MutationOperation[] = [{ op: 'unpin', component_id: 'cmp_a' }];
    const pin: MutationOperation[] = [{ op: 'pin', component_id: 'cmp_a' }];
    const both = withPinsSent(withPinsSent(new Map(), unpin), pin);

    assert.deepEqual(shownPins(canvas, withPinsSent(new Map(), unpin)), []);

    assert.deepEqual(shownPins(canvas, both), ['cmp_a']);
    assert.deepEqual(shownPins(canvas, withPinsSettled(both, unpin)), ['cmp_a']);
    assert.deepEqual(shownPins(canvas, withPinsSettled(withPinsSettled(both, unpin), pin)), [
        'cmp_a',
    ]);
});

test("a canvas without the manifest's pins leaves them to the save, and local pins stay", () => {
    assert.equal(shownPins({ compositionId: null, revision: -1, ids: ['cmp_a'] }, new Map()), null);
    assert.equal(shownPins(null, new Map()), null);

    // The document keeps a local or text card's pin and takes the harness's.
    const harness = (id: string) => id.startsWith('cmp_');

    assert.deepEqual(withHarnessPins(['local_1', 'cmp_old', 'text_1'], ['cmp_a'], harness), [
        'local_1',
        'text_1',
        'cmp_a',
    ]);

    const same = ['local_1', 'cmp_a'];

    assert.equal(withHarnessPins(same, ['cmp_a'], harness), same);
});
