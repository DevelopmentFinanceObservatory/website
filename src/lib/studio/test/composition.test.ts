import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasWidgetsOf } from '../../chat/canvas.ts';
import {
    createLegacyCanvas,
    restoreCanvas,
    takeManifest,
    type CanvasBaseline,
} from '../composition.ts';
import type { CompositionManifest, MutationOperation } from '../wire.ts';

const manifest = (revision: number, ids: string[], id = 'cps_1'): CompositionManifest => ({
    composition_id: id,
    revision,
    actor: 'model',
    blocks: ids.map((cid) => ({ component_id: cid, revision: 1, type: 'line_chart', title: cid })),
    counts: { all: ids.length, stats: 0, charts: ids.length, tables: 0, notes: 0 },
});

const base: CanvasBaseline = { compositionId: 'cps_1', revision: 3, ids: ['cmp_1', 'cmp_2'] };

test('a newer manifest of the same composition becomes the baseline', () => {
    assert.deepEqual(takeManifest(base, manifest(4, [])), {
        compositionId: 'cps_1',
        revision: 4,
        ids: [],
    });
});

test('a manifest no newer than the baseline arrived late and changes nothing', () => {
    assert.equal(takeManifest(base, manifest(3, [])), null);
    assert.equal(takeManifest(base, manifest(2, [])), null);
});

test('another composition, a legacy canvas or no baseline starts afresh', () => {
    assert.deepEqual(takeManifest(base, manifest(1, ['cmp_9'], 'cps_fork'))?.ids, ['cmp_9']);
    assert.deepEqual(takeManifest(null, manifest(1, []))?.ids, []);
    assert.deepEqual(
        takeManifest({ compositionId: null, revision: -1, ids: ['cmp_1'] }, manifest(0, []))?.ids,
        [],
    );
});

const legacy = {
    sessionId: 'conversation_1',
    widgets: [
        { kind: 'text' as const, id: 'cmp_hidden', title: 'Hidden', body: '', turn: 1 },
        { kind: 'text' as const, id: 'cmp_pinned', title: 'Pinned', body: '', turn: 1 },
        { kind: 'text' as const, id: 'cmp_grace', title: 'Grace', body: '', turn: 1 },
        { kind: 'text' as const, id: 'cmp_latest', title: 'Latest', body: '', turn: 2 },
        { kind: 'text' as const, id: 'cmp_removed', title: 'Removed', body: '', turn: 2 },
    ],
    pinnedIds: ['cmp_pinned'],
    removedIds: ['cmp_removed'],
    graceIds: ['cmp_grace'],
    graceTurn: 2,
    textCards: [{ kind: 'text' as const, id: 'text_local', title: 'Local', body: '' }],
};

test('forks and fresh conversations cannot inherit a legacy baseline', () => {
    assert.equal(restoreCanvas({ ...legacy, sessionId: null, canvas: base }), null);
    assert.equal(restoreCanvas(undefined), null);
    assert.deepEqual(restoreCanvas({ ...legacy, canvas: base }), base);
});

test("a fork's inherited cards are no harness cards of its legacy baseline", () => {
    assert.deepEqual(restoreCanvas({ ...legacy, localIds: ['cmp_latest'] })?.ids, [
        'cmp_pinned',
        'cmp_grace',
    ]);
});

test('a legacy save showing 3 of 12 cards opens with 3 and leaves a 3-block manifest', async () => {
    const drawn = Array.from({ length: 12 }, (_, at) => `cmp_${at}`);
    const save = {
        sessionId: 'conversation_1',
        widgets: drawn.map((id, at) => ({
            kind: 'text' as const,
            id,
            title: id,
            body: '',
            turn: at < 10 ? 1 : 2,
        })),
        pinnedIds: ['cmp_0'],
        removedIds: [],
    };
    const restored = restoreCanvas(save)!;
    const opened = canvasWidgetsOf({ ...save, canvas: restored }).map((widget) => widget.id);

    assert.deepEqual(opened, ['cmp_0', 'cmp_10', 'cmp_11']);

    // The harness holds every card the conversation drew.
    let held = manifest(5, drawn);
    const sent: MutationOperation[][] = [];
    const taken: CompositionManifest[] = [];
    const legacy = createLegacyCanvas({
        ids: restored.ids,
        mutate: async (operations) => {
            sent.push(operations);

            const removed = new Set(
                operations.flatMap((op) => (op.op === 'remove' ? [op.component_id] : [])),
            );

            held = manifest(
                held.revision + 1,
                held.blocks.map((block) => block.component_id).filter((id) => !removed.has(id)),
            );

            return held;
        },
        onTake: (answer) => taken.push(answer),
        onChange: () => {},
    });

    await legacy.offer(held);

    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.length, 9);
    assert.deepEqual(
        taken.map((answer) => answer.blocks.map((block) => block.component_id)),
        [['cmp_0', 'cmp_10', 'cmp_11']],
    );

    // A failed remove leaves the canvas legacy and sends nothing more.
    const failing = createLegacyCanvas({
        ids: restored.ids,
        mutate: async () => null,
        onTake: (answer) => taken.push(answer),
        onChange: () => {},
    });

    await failing.offer(manifest(5, drawn));
    await failing.offer(manifest(6, drawn));
    assert.equal(taken.length, 1);
});
