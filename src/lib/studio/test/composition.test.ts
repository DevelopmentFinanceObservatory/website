import assert from 'node:assert/strict';
import test from 'node:test';

import { restoreCanvas, takeManifest, type CanvasBaseline } from '../composition.ts';
import type { CompositionManifest } from '../wire.ts';

const manifest = (revision: number, ids: string[], id = 'cps_1'): CompositionManifest => ({
    composition_id: id,
    revision,
    actor: 'model',
    blocks: ids.map((cid) => ({ component_id: cid, revision: 1, type: 'line_chart', title: cid })),
    counts: { all: ids.length, stats: 0, charts: ids.length, tables: 0, notes: 0 },
});

const base: CanvasBaseline = { compositionId: 'cps_1', revision: 3, ids: ['cmp_1', 'cmp_2'] };

test('a card on the baseline and not on a newer manifest was taken off', () => {
    assert.deepEqual(takeManifest(base, manifest(4, ['cmp_2']))?.removed, ['cmp_1']);
});

test('clearing the canvas takes off every card and leaves an empty baseline', () => {
    const taken = takeManifest(base, manifest(4, []));

    assert.deepEqual(taken?.removed, ['cmp_1', 'cmp_2']);
    assert.deepEqual(taken?.baseline, { compositionId: 'cps_1', revision: 4, ids: [] });
});

test('a manifest that only adds takes nothing off', () => {
    assert.deepEqual(takeManifest(base, manifest(4, ['cmp_1', 'cmp_2', 'cmp_3']))?.removed, []);
});

test('a manifest no newer than the baseline arrived late and changes nothing', () => {
    assert.equal(takeManifest(base, manifest(3, [])), null);
    assert.equal(takeManifest(base, manifest(2, [])), null);
});

test('another composition or no baseline starts afresh and takes nothing off', () => {
    assert.deepEqual(takeManifest(base, manifest(1, [], 'cps_fork'))?.removed, []);
    assert.deepEqual(takeManifest(null, manifest(1, []))?.removed, []);
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

test('the first clear removes visible harness cards from a legacy save', () => {
    const taken = takeManifest(restoreCanvas(legacy), manifest(4, []));

    assert.deepEqual(taken?.removed, ['cmp_pinned', 'cmp_grace', 'cmp_latest']);
    assert.deepEqual(taken?.baseline, { compositionId: 'cps_1', revision: 4, ids: [] });
});

test('the first partial removal preserves the legacy cards still on canvas', () => {
    assert.deepEqual(
        takeManifest(restoreCanvas(legacy), manifest(4, ['cmp_pinned', 'cmp_latest']))?.removed,
        ['cmp_grace'],
    );
});

test('a migrated baseline rejects late manifests after its first update', () => {
    const migrated = takeManifest(restoreCanvas(legacy), manifest(4, ['cmp_latest']))!.baseline;

    assert.equal(takeManifest(migrated, manifest(3, [])), null);
    assert.deepEqual(takeManifest(migrated, manifest(1, [], 'cps_fork'))?.removed, []);
});

test('forks and fresh conversations cannot inherit a legacy baseline', () => {
    assert.equal(restoreCanvas({ ...legacy, sessionId: null, canvas: base }), null);
    assert.equal(restoreCanvas(undefined), null);
    assert.deepEqual(restoreCanvas({ ...legacy, canvas: base }), base);
    assert.deepEqual(takeManifest(restoreCanvas(undefined), manifest(1, ['cmp_new']))?.removed, []);
});
