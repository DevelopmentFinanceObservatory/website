import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createCanvasEdits,
    pinEdit,
    shownPins,
    withHarnessPins,
    withPinsSent,
    withPinsSettled,
} from '../canvasEdits.ts';
import { takeManifest } from '../composition.ts';
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

        await edits.enqueue('session', remove);
        await edits.enqueue('session', add);
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
    const canvas = takeManifest(
        null,
        pinnedManifest(3, [
            ['cmp_a', true],
            ['cmp_b', false],
        ]),
    );

    assert.deepEqual(shownPins(canvas, new Map()), ['cmp_a']);

    // Pin b: shown at once while the edit is in flight.
    const pin: MutationOperation[] = [{ op: 'pin', component_id: 'cmp_b' }];
    const sent = withPinsSent(new Map(), pin);

    assert.deepEqual(shownPins(canvas, sent), ['cmp_a', 'cmp_b']);

    // The harness refused it: the manifest decides again.
    assert.deepEqual(shownPins(canvas, withPinsSettled(sent, pin)), ['cmp_a']);

    // It accepted it: the answer's manifest holds the pin.
    const answered = takeManifest(
        canvas,
        pinnedManifest(4, [
            ['cmp_a', true],
            ['cmp_b', true],
        ]),
    );

    assert.deepEqual(shownPins(answered, withPinsSettled(sent, pin)), ['cmp_a', 'cmp_b']);
});

test('a pin on a card a turn removed rolls back, and Add brings it back as the manifest says', () => {
    // A turn took cmp_b off; the page pinned it before the manifest arrived.
    const canvas = takeManifest(null, pinnedManifest(5, [['cmp_a', false]]));
    const pin: MutationOperation[] = [{ op: 'pin', component_id: 'cmp_b' }];
    const failed = withPinsSettled(withPinsSent(new Map(), pin), pin);

    assert.deepEqual(shownPins(canvas, failed), []);

    const added = takeManifest(
        canvas,
        pinnedManifest(6, [
            ['cmp_a', false],
            ['cmp_b', false],
        ]),
    );

    assert.deepEqual(shownPins(added, failed), []);
});

test('a failed Remove of a pinned card leaves it pinned, and two edits settle in turn', () => {
    const canvas = takeManifest(null, pinnedManifest(2, [['cmp_a', true]]));
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
