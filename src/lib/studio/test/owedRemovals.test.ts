/**
 * `owedRemovals.ts`: the harness cards the user took off whose removal the
 * harness has not confirmed. Add takes a card out of the set, and a canvas
 * settles the removals it confirms.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasWidgetsOf } from '../../chat/canvas.ts';
import { createCanvasEdits } from '../canvasEdits.ts';
import { takeManifest, withoutRemovedCards, type CanvasBaseline } from '../composition.ts';
import {
    againstWhenSent,
    confirm,
    drainOwedRemovals,
    forgive,
    owe,
    OWED_RESENDS,
    OWED_RETRY_MAX_MS,
    owedRetryAfter,
    nextResend,
    owedRemovalsOf,
    settle,
    type OwedRemoval,
    type ResendOutcome,
} from '../owedRemovals.ts';
import { mutateComposition } from '../studioClient.ts';
import type { CompositionManifest } from '../wire.ts';

const card = (id: string) => ({ kind: 'text' as const, id, title: id, body: '', turn: 1 });

const baseline = (ids: string[]): CanvasBaseline => ({
    compositionId: 'cps_1',
    revision: 3,
    ids,
    pinned: [],
});

const manifest = (revision: number, blocks: [string, number][]): CompositionManifest => ({
    composition_id: 'cps_1',
    revision,
    actor: 'model',
    blocks: blocks.map(([id, cardRevision]) => ({
        component_id: id,
        revision: cardRevision,
        type: 'line_chart',
        title: id,
    })),
    counts: { all: blocks.length, stats: 0, charts: blocks.length, tables: 0, notes: 0 },
});

// The cards a page with `owed` sends a `remove` for against `canvas`, in
// the order they go.
const resent = (
    owed: OwedRemoval[],
    canvas: CanvasBaseline | null,
    inFlight: string[] = [],
    sent = new Map<string, number>(),
) => {
    const skip = new Set<string>();
    const next = () =>
        nextResend({
            owed,
            baseline: canvas,
            inFlight: new Set(inFlight),
            sent,
            held: false,
            skip,
        });

    for (let resend = next(); resend; resend = next()) {
        skip.add(resend.id);
    }

    return [...skip];
};

// A page and a harness for drainOwedRemovals: the page's owed set and
// canvas, settled before each send as useChat does, and a harness at
// `revision` holding `held`, which refuses a send against another revision
// as stale and a remove of a card it lacks as no block. `moves` revisions
// land on the harness before each send, as another tab or the model would.
const page = ({
    owed,
    canvas,
    revision,
    held,
    moves = 0,
}: {
    owed: OwedRemoval[];
    canvas: CanvasBaseline;
    revision: number;
    held: string[];
    moves?: number;
}) => {
    const harness = { revision, held: [...held] };
    const state = { owed, canvas };
    const sent: [string, number][] = [];
    const capped: [string, ResendOutcome][] = [];
    const take = () => {
        state.canvas =
            takeManifest(
                state.canvas,
                manifest(
                    harness.revision,
                    harness.held.map((id) => [id, 1]),
                ),
            )?.baseline ?? state.canvas;
    };
    const drain = () =>
        drainOwedRemovals({
            next: (skip) => {
                state.owed = settle(state.owed, state.canvas, new Map());

                return nextResend({
                    owed: state.owed,
                    baseline: state.canvas,
                    inFlight: new Set(),
                    sent: counts,
                    held: false,
                    skip,
                });
            },
            send: async ({ id, against }) => {
                harness.revision += moves;
                sent.push([id, against.revision]);

                if (against.revision !== harness.revision) {
                    return 'stale';
                }

                if (!harness.held.includes(id)) {
                    state.canvas = withoutRemovedCards(state.canvas, [id]) ?? state.canvas;

                    return 'gone';
                }

                harness.held = harness.held.filter((other) => other !== id);
                harness.revision += 1;
                take();
                state.owed = state.owed.filter((entry) => entry.id !== id);

                return 'answered';
            },
            reread: async () => {
                const before = state.canvas;

                take();

                return state.canvas !== before;
            },
            sent: counts,
            onCapped: (id, outcome) => capped.push([id, outcome]),
        });
    const counts = new Map<string, number>();

    return { harness, state, sent, capped, drain };
};

test('Add takes a card out of the owed set, so it shows and no remove goes for it', () => {
    const canvas = baseline(['cmp_a', 'cmp_x']);
    const owed = owe([], 'cmp_x', 1);
    const shown = (owedRemovals: typeof owed) =>
        canvasWidgetsOf({
            widgets: [card('cmp_a'), card('cmp_x')],
            pinnedIds: [],
            removedIds: [],
            canvas,
            owedRemovals,
        }).map((widget) => widget.id);

    assert.deepEqual(shown(owed), ['cmp_a']);
    assert.deepEqual(resent(owed, canvas), ['cmp_x']);

    const added = forgive(owed, 'cmp_x');

    assert.deepEqual(shown(added), ['cmp_a', 'cmp_x']);
    assert.deepEqual(resent(added, canvas), []);
    // A removal owed already keeps the revision it was owed at, and the set
    // keeps its identity when nothing changes, so no save is scheduled.
    assert.equal(owe(owed, 'cmp_x', 4), owed);
    assert.equal(forgive(added, 'cmp_x'), added);
});

test('a canvas settles the removals it confirms, and a card drawn again since', () => {
    const owed = [
        { id: 'cmp_gone', revision: 1 },
        { id: 'cmp_held', revision: 1 },
        { id: 'cmp_redrawn', revision: 1 },
        { id: 'cmp_unknown', revision: null },
    ];
    const canvas = baseline(['cmp_held', 'cmp_redrawn', 'cmp_unknown']);
    const revisions = new Map([
        ['cmp_held', 1],
        ['cmp_redrawn', 2],
        ['cmp_unknown', 5],
    ]);

    assert.deepEqual(
        settle(owed, canvas, revisions).map((entry) => entry.id),
        ['cmp_held', 'cmp_unknown'],
    );
    // A legacy canvas and none settle nothing, and send nothing.
    const legacy = { compositionId: null, revision: -1, ids: [] };

    assert.equal(settle(owed, legacy, revisions), owed);
    assert.equal(settle(owed, null, revisions), owed);
    assert.deepEqual(resent(owed, legacy), []);
    // A remove in flight is not sent twice, and one sent OWED_RESENDS times
    // this page load waits for the next.
    assert.deepEqual(resent(owed, canvas, ['cmp_held'], new Map([['cmp_redrawn', OWED_RESENDS]])), [
        'cmp_unknown',
    ]);
});

test('a manifest that holds an owed card at a newer revision settles it before the page draws it', () => {
    // The user removed cmp_x at revision 2, and the remove failed. Another
    // tab's turn had the model revise cmp_x to revision 3.
    const owed = owe([], 'cmp_x', 2);
    const taken = takeManifest(
        baseline(['cmp_a', 'cmp_x']),
        manifest(5, [
            ['cmp_a', 1],
            ['cmp_x', 3],
        ]),
    )!.baseline;

    // The page has not read cmp_x's revision 3 yet (no drawn revisions).
    assert.deepEqual(settle(owed, taken, new Map()), []);
    assert.deepEqual(resent(settle(owed, taken, new Map()), taken), []);
    // At the revision removed, the card is still owed.
    const same = takeManifest(
        taken,
        manifest(6, [
            ['cmp_a', 1],
            ['cmp_x', 2],
        ]),
    )!.baseline;

    assert.deepEqual(settle(owed, same, new Map()), owed);
});

test("a reopened page holds its resends until it has read the harness's state, then sends each against that canvas", () => {
    const owed = owe([], 'cmp_x', 2);
    const saved = baseline(['cmp_a', 'cmp_x']);
    const resend = (held: boolean) =>
        nextResend({ owed, baseline: saved, inFlight: new Set(), sent: new Map(), held });

    assert.equal(resend(true), null);
    assert.deepEqual(resend(false), {
        id: 'cmp_x',
        against: { compositionId: 'cps_1', revision: 3 },
    });
});

test('owed removals go one at a time, each against the revision the previous answer left', async () => {
    // A save from before manifest pins reopens owing three cards, which the
    // harness holds at revision 5.
    const ids = ['cmp_x', 'cmp_y', 'cmp_z'];
    const run = page({
        owed: ids.map((id) => ({ id, revision: 1 })),
        canvas: { compositionId: 'cps_1', revision: 5, ids: ['cmp_a', ...ids], pinned: [] },
        revision: 5,
        held: ['cmp_a', ...ids],
    });

    await run.drain();

    assert.deepEqual(run.sent, [
        ['cmp_x', 5],
        ['cmp_y', 6],
        ['cmp_z', 7],
    ]);
    assert.deepEqual(run.harness.held, ['cmp_a']);
    assert.deepEqual(run.state.owed, []);
});

test('a resend whose answer was lost settles once the harness says the card is gone', async (t) => {
    // The harness committed the remove of cmp_x and the answer was lost. A
    // resend against the page's older revision is stale, and the read that
    // follows lacks the card. One the harness lacks at the page's revision
    // is refused as no block.
    const cases: [string, number][] = [
        ['stale revision', 6],
        ['no block', 5],
    ];

    for (const [name, revision] of cases) {
        await t.test(name, async () => {
            const run = page({
                owed: owe([], 'cmp_x', 1),
                canvas: {
                    compositionId: 'cps_1',
                    revision: 5,
                    ids: ['cmp_a', 'cmp_x'],
                    pinned: [],
                },
                revision,
                held: ['cmp_a'],
            });

            await run.drain();

            assert.deepEqual(run.sent, [['cmp_x', 5]]);
            assert.deepEqual(run.state.owed, []);
            assert.deepEqual(run.capped, []);
        });
    }
});

test('a card refused as stale on every send stops at OWED_RESENDS and is named once', async () => {
    // Another writer moves the canvas before each send.
    const run = page({
        owed: owe([], 'cmp_x', 1),
        canvas: { compositionId: 'cps_1', revision: 5, ids: ['cmp_a', 'cmp_x'], pinned: [] },
        revision: 5,
        held: ['cmp_a', 'cmp_x'],
        moves: 1,
    });

    await run.drain();
    await run.drain();

    assert.equal(run.sent.length, OWED_RESENDS);
    assert.deepEqual(run.capped, [['cmp_x', 'stale']]);
    assert.deepEqual(run.harness.held, ['cmp_a', 'cmp_x']);
});

test('a resend goes against the revision the canvas holds when the edit queue reaches it', async () => {
    let canvas: CanvasBaseline = baseline(['cmp_a', 'cmp_x']);
    const seen: [string, number | undefined][] = [];
    const edits = createCanvasEdits({
        mutate: async (_session, operations, against) => {
            seen.push([operations[0]!.op, against?.revision]);
            canvas = { ...canvas, revision: canvas.revision + 1 };

            return manifest(canvas.revision, [['cmp_a', 1]]);
        },
        onManifest: () => {},
        onFailure: () => assert.fail('the harness answered'),
    });
    const resend = nextResend({
        owed: owe([], 'cmp_x', 1),
        baseline: canvas,
        inFlight: new Set(),
        sent: new Map(),
        held: false,
    })!;

    // The user's pin is queued ahead of the resend and moves the canvas to 4.
    const pinned = edits.enqueue('conv', [{ op: 'pin', component_id: 'cmp_a' }]);
    const removed = edits.enqueue('conv', [{ op: 'remove', component_id: 'cmp_x' }], () =>
        againstWhenSent(resend.against, canvas),
    );

    assert.deepEqual(await Promise.all([pinned, removed]), [true, true]);
    assert.deepEqual(seen, [
        ['pin', undefined],
        ['remove', 4],
    ]);
    // A page that holds another composition by then sends the one picked,
    // which the harness refuses.
    assert.deepEqual(
        againstWhenSent(resend.against, { ...canvas, compositionId: 'cps_2' }),
        resend.against,
    );
});

test('a run that leaves cards behind runs again after a wait that doubles', () => {
    assert.equal(owedRetryAfter(0), null);
    assert.deepEqual(
        [1, 2, 3].map((runs) => owedRetryAfter(runs)),
        [2_000, 4_000, 8_000],
    );
    assert.equal(owedRetryAfter(20), OWED_RETRY_MAX_MS);
});

test('a resend goes with the composition and revision it is against, so a canvas changed since refuses it', async (t) => {
    const bodies: unknown[] = [];

    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));

        return Response.json(manifest(4, [['cmp_a', 1]]));
    });

    const edits = createCanvasEdits({
        mutate: (session, operations, against) =>
            mutateComposition(session, operations, against?.revision, against?.compositionId),
        onManifest: () => {},
        onFailure: () => assert.fail('the harness answered'),
    });
    const resend = nextResend({
        owed: owe([], 'cmp_x', 2),
        baseline: baseline(['cmp_a', 'cmp_x']),
        inFlight: new Set(),
        sent: new Map(),
        held: false,
    })!;

    assert.equal(
        await edits.enqueue('conv', [{ op: 'remove', component_id: 'cmp_x' }], resend.against),
        true,
    );
    assert.deepEqual(bodies, [
        {
            kind: 'composition.mutate',
            schema_version: 1,
            conversation_id: 'conv',
            composition_id: 'cps_1',
            operations: [{ op: 'remove', component_id: 'cmp_x' }],
            expected_revision: 3,
        },
    ]);
});

test('a remove the harness answered clears its own entry, and a later Remove of the card keeps its own', () => {
    const owed = owe([], 'cmp_x', 2);
    const entry = owed[0]!;

    assert.deepEqual(confirm(owed, entry), []);

    // The answer lands after the card was removed again at a newer revision.
    const again = owe(confirm(owed, entry), 'cmp_x', 9);

    assert.equal(confirm(again, entry), again);
    assert.deepEqual(again, [{ id: 'cmp_x', revision: 9 }]);
});

test("a save's own owed set wins over its removals, whatever its baseline", () => {
    const pinless = { compositionId: 'cps_1', revision: 2, ids: ['cmp_x'] };

    assert.deepEqual(owedRemovalsOf({ canvas: pinless, removedIds: ['cmp_x'] }), [
        { id: 'cmp_x', revision: null },
    ]);
    assert.deepEqual(
        owedRemovalsOf({ canvas: pinless, removedIds: ['cmp_x'], owedRemovals: [] }),
        [],
    );
    // A save with pins that lists a harness card among its removals owes
    // nothing: its page kept harness removals in the manifest.
    assert.deepEqual(owedRemovalsOf({ canvas: baseline(['cmp_x']), removedIds: ['cmp_x'] }), []);
});
