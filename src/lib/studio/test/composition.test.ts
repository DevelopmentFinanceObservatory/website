import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasWidgetsOf } from '../../chat/canvas.ts';
import {
    createLegacyCanvas,
    legacyHiddenCards,
    restoreCanvas,
    takeManifest,
    type CanvasBaseline,
    type LegacyLocal,
} from '../composition.ts';
import type { CompositionManifest, MutationOperation } from '../wire.ts';

const manifest = (
    revision: number,
    ids: string[],
    id = 'cps_1',
    cardRevisions: Record<string, number> = {},
): CompositionManifest => ({
    composition_id: id,
    revision,
    actor: 'model',
    blocks: ids.map((cid) => ({
        component_id: cid,
        revision: cardRevisions[cid] ?? 1,
        type: 'line_chart',
        title: cid,
    })),
    counts: { all: ids.length, stats: 0, charts: ids.length, tables: 0, notes: 0 },
});

const base: CanvasBaseline = { compositionId: 'cps_1', revision: 3, ids: ['cmp_1', 'cmp_2'] };

test('a newer manifest of the same composition becomes the baseline', () => {
    assert.deepEqual(takeManifest(base, manifest(4, [])), {
        compositionId: 'cps_1',
        revision: 4,
        ids: [],
        pinned: [],
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
    const expected: number[] = [];
    const taken: CompositionManifest[] = [];
    const local: LegacyLocal[] = [];
    const hidden = legacyHiddenCards(save, restored, new Map(drawn.map((id) => [id, 1])));
    const legacy = createLegacyCanvas({
        ids: restored.ids,
        hidden,
        pinned: save.pinnedIds,
        mutate: async (operations, expectedRevision) => {
            sent.push(operations);
            expected.push(expectedRevision);

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
        onLocal: (cards) => local.push(cards),
        onChange: () => {},
    });

    await legacy.offer(held);

    // Nine removes, and the pin the save showed.
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.filter((op) => op.op === 'remove').length, 9);
    assert.deepEqual(
        sent[0]!.filter((op) => op.op === 'pin'),
        [{ op: 'pin', component_id: 'cmp_0' }],
    );
    assert.deepEqual(expected, [5]);
    assert.deepEqual(
        taken.map((answer) => answer.blocks.map((block) => block.component_id)),
        [['cmp_0', 'cmp_10', 'cmp_11']],
    );
    assert.deepEqual(local, []);

    // A failed remove leaves the canvas legacy and sends nothing more.
    const failing = createLegacyCanvas({
        ids: restored.ids,
        hidden,
        pinned: save.pinnedIds,
        mutate: async () => null,
        onTake: (answer) => taken.push(answer),
        onLocal: () => assert.fail('a legacy canvas that stays legacy adopts no card'),
        onChange: () => {},
    });

    await failing.offer(manifest(5, drawn));
    await failing.offer(manifest(6, drawn));
    assert.equal(taken.length, 1);
});

test('a legacy canvas keeps the inherited cards its session never held as local cards', async () => {
    // A fork saved before forks named their local cards, after it went on: a
    // pinned inherited card and its own.
    const save = {
        sessionId: 'conversation_1',
        widgets: [
            { kind: 'text' as const, id: 'cmp_inherited', title: 'Old', body: '', turn: 1 },
            { kind: 'text' as const, id: 'cmp_own', title: 'New', body: '', turn: 2 },
        ],
        pinnedIds: ['cmp_inherited'],
        removedIds: [],
    };
    const restored = restoreCanvas(save)!;
    const local: string[] = [];
    let canvas: CanvasBaseline | null = restored;
    const legacy = createLegacyCanvas({
        ids: restored.ids,
        hidden: legacyHiddenCards(save, restored, new Map()),
        pinned: [],
        mutate: async () => assert.fail('the harness holds no card the page hides'),
        onTake: (answer) => {
            canvas = takeManifest(canvas, answer);
        },
        onLocal: (cards) => local.push(...cards.shown),
        onChange: () => {},
    });

    await legacy.offer(manifest(3, ['cmp_own']));

    assert.deepEqual(local, ['cmp_inherited']);
    assert.deepEqual(
        canvasWidgetsOf({ ...save, canvas, localIds: local }).map((widget) => widget.id),
        ['cmp_inherited', 'cmp_own'],
    );
});

test('a legacy canvas removes only the cards its save hid, at the revision it hid them', async () => {
    // Saved showing turn 2's card: turn 1's two cards were hidden at
    // revision 1. Since the save, another tab revised one of them and drew a
    // card of its own.
    const save = {
        sessionId: 'conversation_1',
        widgets: [
            { kind: 'text' as const, id: 'cmp_hidden', title: 'Hidden', body: '', turn: 1 },
            { kind: 'text' as const, id: 'cmp_revised', title: 'Revised', body: '', turn: 1 },
            { kind: 'text' as const, id: 'cmp_shown', title: 'Shown', body: '', turn: 2 },
        ],
        pinnedIds: [],
        removedIds: [],
    };
    const restored = restoreCanvas(save)!;
    const hidden = legacyHiddenCards(
        save,
        restored,
        new Map([
            ['cmp_hidden', 1],
            ['cmp_revised', 1],
            ['cmp_shown', 1],
        ]),
    );
    const offered = manifest(
        7,
        ['cmp_hidden', 'cmp_revised', 'cmp_shown', 'cmp_other_tab'],
        'cps_1',
        { cmp_revised: 2 },
    );
    const sent: [MutationOperation[], number][] = [];
    const taken: string[][] = [];
    const legacy = createLegacyCanvas({
        ids: restored.ids,
        hidden,
        pinned: [],
        mutate: async (operations, expectedRevision) => {
            sent.push([operations, expectedRevision]);

            return manifest(8, ['cmp_revised', 'cmp_shown', 'cmp_other_tab'], 'cps_1', {
                cmp_revised: 2,
            });
        },
        onTake: (answer) => taken.push(answer.blocks.map((block) => block.component_id)),
        onLocal: () => assert.fail('the harness holds every card of this save'),
        onChange: () => {},
    });

    await legacy.offer(offered);

    assert.deepEqual(sent, [[[{ op: 'remove', component_id: 'cmp_hidden' }], 7]]);
    assert.deepEqual(taken, [['cmp_revised', 'cmp_shown', 'cmp_other_tab']]);
});

test("a legacy fork's hidden inherited cards become local and stay off the canvas", async () => {
    // A fork saved before forks named their local cards: an inherited card
    // the legacy rule hid, one it showed, and the fork's own.
    const save = {
        sessionId: 'conversation_1',
        widgets: [
            { kind: 'text' as const, id: 'cmp_old_hidden', title: 'Old', body: '', turn: 1 },
            { kind: 'text' as const, id: 'cmp_old_pinned', title: 'Old', body: '', turn: 1 },
            { kind: 'text' as const, id: 'cmp_own', title: 'New', body: '', turn: 2 },
        ],
        pinnedIds: ['cmp_old_pinned'],
        removedIds: [],
    };
    const restored = restoreCanvas(save)!;
    const local: LegacyLocal[] = [];
    let canvas: CanvasBaseline | null = restored;
    const legacy = createLegacyCanvas({
        ids: restored.ids,
        hidden: legacyHiddenCards(save, restored, new Map([['cmp_old_hidden', 3]])),
        pinned: save.pinnedIds,
        mutate: async () => assert.fail('the harness holds no card the page hides'),
        onTake: (answer) => {
            canvas = takeManifest(canvas, answer);
        },
        onLocal: (cards) => local.push(cards),
        onChange: () => {},
    });

    await legacy.offer(manifest(3, ['cmp_own']));

    assert.deepEqual(local, [{ shown: ['cmp_old_pinned'], hidden: ['cmp_old_hidden'] }]);

    // The canvas document marks both local and the hidden one removed, so
    // Add brings it back on the page alone.
    const localIds = [...local[0]!.shown, ...local[0]!.hidden];

    assert.deepEqual(
        canvasWidgetsOf({ ...save, canvas, localIds, removedIds: local[0]!.hidden }).map(
            (widget) => widget.id,
        ),
        ['cmp_old_pinned', 'cmp_own'],
    );
    assert.deepEqual(
        canvasWidgetsOf({ ...save, canvas, localIds, removedIds: [] }).map((widget) => widget.id),
        ['cmp_old_hidden', 'cmp_old_pinned', 'cmp_own'],
    );
});

test("a legacy canvas pins the harness cards its save showed pinned, against the manifest's revision", async () => {
    const save = {
        sessionId: 'conversation_1',
        widgets: [
            { kind: 'text' as const, id: 'cmp_hidden', title: '', body: '', turn: 1 },
            { kind: 'text' as const, id: 'cmp_pinned', title: '', body: '', turn: 1 },
            { kind: 'text' as const, id: 'cmp_latest', title: '', body: '', turn: 2 },
        ],
        pinnedIds: ['cmp_pinned'],
        removedIds: [],
    };
    const restored = restoreCanvas(save)!;
    const sent: [MutationOperation[], number][] = [];
    const legacy = createLegacyCanvas({
        ids: restored.ids,
        hidden: legacyHiddenCards(save, restored, new Map([['cmp_hidden', 1]])),
        pinned: save.pinnedIds,
        mutate: async (operations, expectedRevision) => {
            sent.push([operations, expectedRevision]);

            return manifest(5, ['cmp_pinned', 'cmp_latest']);
        },
        onTake: () => {},
        onLocal: () => {},
        onChange: () => {},
    });

    await legacy.offer(manifest(4, ['cmp_hidden', 'cmp_pinned', 'cmp_latest']));

    assert.deepEqual(sent, [
        [
            [
                { op: 'remove', component_id: 'cmp_hidden' },
                { op: 'pin', component_id: 'cmp_pinned' },
            ],
            4,
        ],
    ]);

    // A manifest already holding the pin, and nothing to remove, sends nothing.
    const settled = createLegacyCanvas({
        ids: restored.ids,
        hidden: new Map(),
        pinned: save.pinnedIds,
        mutate: async () => assert.fail('nothing to bring to the harness'),
        onTake: () => {},
        onLocal: () => {},
        onChange: () => {},
    });
    const held = manifest(4, ['cmp_pinned', 'cmp_latest']);

    await settled.offer({
        ...held,
        blocks: held.blocks.map((block) => ({
            ...block,
            pinned: block.component_id === 'cmp_pinned',
        })),
    });
});

test('takeManifest keeps which harness cards the manifest pins', () => {
    const held = manifest(4, ['cmp_a', 'cmp_b']);

    assert.deepEqual(
        takeManifest(null, {
            ...held,
            blocks: held.blocks.map((block) => ({
                ...block,
                pinned: block.component_id === 'cmp_b',
            })),
        })?.pinned,
        ['cmp_b'],
    );
});
