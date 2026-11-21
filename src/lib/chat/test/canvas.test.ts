/**
 * `canvas.ts`: which cards a canvas shows. The harness manifest decides for a
 * save that holds one, so cards accumulate across turns; a save from before
 * it keeps the latest-turn rule it was drawn under.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { takeManifest, type CanvasBaseline } from '../../studio/composition.ts';
import type { CompositionManifest } from '../../studio/wire.ts';
import { canvasWidgetsOf, forkedCanvas, isHarnessCard, type CanvasState } from '../canvas.ts';
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

const baseline = (ids: string[]): CanvasBaseline => ({
    compositionId: 'cps_1',
    revision: 2,
    ids,
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
    const taken = takeManifest(baseline(['cmp_first', 'cmp_second']), manifest(3, ['cmp_first']));

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
    const off = takeManifest(drawn, manifest(3, ['cmp_first']));
    const back = takeManifest(off, manifest(4, ['cmp_first', 'cmp_second']));

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
    // Its session never held the hidden card, so Add stays on the page.
    assert.equal(isHarnessCard(fork, 'cmp_first'), false);

    const added = {
        ...fork,
        removedIds: fork.removedIds.filter((id) => id !== 'cmp_first'),
    };

    assert.deepEqual(ids(added), ['cmp_first', 'cmp_second', 'text_local']);
});
