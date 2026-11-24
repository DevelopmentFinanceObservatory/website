/**
 * `canvas.ts`: which cards a canvas shows. The harness manifest decides for a
 * save that holds one, so cards accumulate across turns. A save from before
 * it keeps the latest-turn rule it was drawn under.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { takeManifest, type CanvasBaseline } from '../../studio/composition.ts';
import { nextResend, owedRemovalsOf, settle } from '../../studio/owedRemovals.ts';
import type { CompositionManifest } from '../../studio/wire.ts';
import {
    canvasWidgetsOf,
    forkedCanvas,
    isHarnessCard,
    savedCanvasWidgetsOf,
    type CanvasState,
} from '../canvas.ts';
import type { TextWidget } from '../widgets.ts';

const card = (id: string, turn: number) => ({
    kind: 'text' as const,
    id,
    title: id,
    body: '',
    turn,
});

const manifest = (revision: number, ids: string[]): CompositionManifest => ({
    composition_id: 'cps_1',
    revision,
    actor: 'model',
    blocks: ids.map((cid) => ({ component_id: cid, revision: 1, type: 'line_chart', title: cid })),
    counts: { all: ids.length, stats: 0, charts: ids.length, tables: 0, notes: 0 },
});

// A baseline as the current page saves it, with the manifest's pins.
const baseline = (ids: string[]): CanvasBaseline => ({
    compositionId: 'cps_1',
    revision: 2,
    ids,
    pinned: [],
});

const textCard: TextWidget = { kind: 'text', id: 'text_local', title: 'Local', body: '' };

const state = (over: Partial<CanvasState>): CanvasState => ({
    widgets: [card('cmp_first', 1), card('cmp_second', 2)],
    pinnedIds: [],
    removedIds: [],
    textCards: [textCard],
    ...over,
});

const ids = (canvas: CanvasState) => canvasWidgetsOf(canvas).map((widget) => widget.id);

test('cards of earlier turns stay on the canvas while the manifest holds them', () => {
    assert.deepEqual(ids(state({ canvas: baseline(['cmp_first', 'cmp_second']) })), [
        'cmp_first',
        'cmp_second',
        'text_local',
    ]);
});

test('a card the model took off leaves the canvas with the manifest that dropped it', () => {
    const taken = takeManifest(
        baseline(['cmp_first', 'cmp_second']),
        manifest(3, ['cmp_first']),
    )?.baseline;

    assert.deepEqual(ids(state({ canvas: taken })), ['cmp_first', 'text_local']);
});

test('a save without a manifest keeps the latest turn, its pins and its grace', () => {
    const legacy = state({
        widgets: [
            card('cmp_old', 1),
            card('cmp_pinned', 1),
            card('cmp_grace', 1),
            card('cmp_new', 2),
        ],
        pinnedIds: ['cmp_pinned'],
        graceIds: ['cmp_grace'],
        graceTurn: 2,
    });

    assert.deepEqual(ids(legacy), ['cmp_pinned', 'cmp_grace', 'cmp_new', 'text_local']);
    assert.deepEqual(ids({ ...legacy, canvas: null }), ids(legacy));
});

test('a save from before manifest pins keeps a card the user removed off, though the manifest holds it', () => {
    // The page that saved it took the card off locally before the harness
    // dropped it, as the share and embed it made showed it.
    const saved = state({
        widgets: [card('cmp_first', 2), card('cmp_second', 2)],
        canvas: { compositionId: 'cps_1', revision: 2, ids: ['cmp_first', 'cmp_second'] },
        removedIds: ['cmp_second'],
    });

    assert.deepEqual(ids(saved), ['cmp_first', 'text_local']);
    assert.deepEqual(
        savedCanvasWidgetsOf(saved).map((widget) => widget.id),
        ['cmp_first', 'text_local'],
    );
    // A baseline with the manifest's pins lets the manifest decide.
    assert.deepEqual(ids({ ...saved, canvas: baseline(['cmp_first', 'cmp_second']) }), [
        'cmp_first',
        'cmp_second',
        'text_local',
    ]);
});

test('an owed removal survives a failed request, a reload and a save, and keeps the card off', () => {
    // A save from before owed removals took cmp_x off on the page alone. A
    // fork's card and a text card come off on the page and owe nothing.
    const legacy = state({
        widgets: [card('cmp_a', 2), card('cmp_x', 2), card('cmp_fork', 1)],
        canvas: { compositionId: 'cps_1', revision: 2, ids: ['cmp_a', 'cmp_x'] },
        localIds: ['cmp_fork'],
        removedIds: ['cmp_x', 'cmp_fork', 'text_local'],
    });
    const owed = owedRemovalsOf(legacy);

    assert.deepEqual(
        owed.map((entry) => entry.id),
        ['cmp_x'],
    );

    // The remove fails, and the owner pins cmp_a: a manifest with pins that
    // still holds cmp_x settles nothing, and the card goes again.
    const pinned = manifest(3, ['cmp_a', 'cmp_x']);

    pinned.blocks[0]!.pinned = true;

    const taken = takeManifest(legacy.canvas ?? null, pinned)!.baseline;
    const kept = settle(owed, taken, new Map());

    assert.equal(kept, owed);
    assert.deepEqual(
        nextResend({
            owed: kept,
            baseline: taken,
            inFlight: new Set(),
            sent: new Map(),
            held: false,
        })?.id,
        'cmp_x',
    );

    // The page saves the pinned baseline with the owed set, and a reload
    // reads the set back: the canvas, its shares and its slots leave cmp_x
    // off.
    const saved = { ...legacy, canvas: taken, owedRemovals: kept };

    assert.deepEqual(owedRemovalsOf(saved), kept);
    assert.deepEqual(ids(saved), ['cmp_a']);
    assert.deepEqual(
        savedCanvasWidgetsOf(saved).map((widget) => widget.id),
        ['cmp_a'],
    );

    // A manifest without cmp_x confirms the removal, and the card stays off.
    const confirmed = takeManifest(taken, manifest(4, ['cmp_a']))!.baseline;

    assert.deepEqual(settle(kept, confirmed, new Map()), []);
    assert.deepEqual(ids({ ...saved, canvas: confirmed, owedRemovals: [] }), ['cmp_a']);

    // Before the first manifest, the owed set keeps the card off as well.
    assert.deepEqual(
        ids({
            ...saved,
            canvas: null,
            localIds: undefined,
            removedIds: ['cmp_fork', 'text_local'],
        }),
        ['cmp_a'],
    );
});

test("a fork's inherited cards show beside the manifest of its own session", () => {
    const fork = state({ localIds: ['cmp_first'] });

    assert.deepEqual(ids(fork), ['cmp_first', 'text_local']);
    assert.deepEqual(ids({ ...fork, canvas: baseline(['cmp_second']) }), [
        'cmp_first',
        'cmp_second',
        'text_local',
    ]);
});

test('a card the model takes off and draws again shows again', () => {
    const drawn = baseline(['cmp_first', 'cmp_second']);
    const off = takeManifest(drawn, manifest(3, ['cmp_first']))?.baseline ?? null;
    const back = takeManifest(off, manifest(4, ['cmp_first', 'cmp_second']))?.baseline;

    // A save that listed the model's removal among the user's still shows it.
    assert.deepEqual(ids(state({ canvas: back, removedIds: ['cmp_second'] })), [
        'cmp_first',
        'cmp_second',
        'text_local',
    ]);
});

test("Add on a fork's removed inherited card shows it with no harness edit", () => {
    const shared = state({
        widgets: [card('cmp_first', 1), card('cmp_second', 2)],
        canvas: baseline(['cmp_second']),
    });
    const fork: CanvasState = { ...shared, ...forkedCanvas(shared) };

    // The fork shows what the share showed.
    assert.deepEqual(ids(fork), ids(shared));

    // So does a fork of a save whose removals list a harness card the user
    // added back, which the save owes no removal.
    const addedBack = state({
        widgets: [card('cmp_first', 1), card('cmp_second', 2)],
        canvas: { compositionId: 'cps_1', revision: 2, ids: ['cmp_first', 'cmp_second'] },
        removedIds: ['cmp_first'],
        owedRemovals: [],
    });

    assert.deepEqual(ids({ ...addedBack, ...forkedCanvas(addedBack) }), ids(addedBack));
    // Its session never held the hidden card, so Add stays on the page.
    assert.equal(isHarnessCard(fork, 'cmp_first'), false);

    const added = {
        ...fork,
        removedIds: fork.removedIds.filter((id) => id !== 'cmp_first'),
    };

    assert.deepEqual(ids(added), ['cmp_first', 'cmp_second', 'text_local']);
});
