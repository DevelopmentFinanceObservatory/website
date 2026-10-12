import assert from 'node:assert/strict';
import test from 'node:test';

import { createCanvasEdits } from '../canvasEdits.ts';
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

test('a refused or failed removal clears its marker and releases the next edit', async () => {
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
                assert.equal(edits.isOwnRemoval('cmp_1'), false);
                failures.push(error);
            },
        });

        await edits.enqueue('session', remove);
        assert.equal(edits.isOwnRemoval('cmp_1'), false);
        await edits.enqueue('session', add);
        assert.equal(calls, 2);
        assert.equal(failures.length, 1);
    }
});

test('repeated removals retain a marker until every queued removal settles', async () => {
    const first = deferred<CompositionManifest | null>();
    const second = deferred<CompositionManifest | null>();
    let calls = 0;
    const markers: boolean[] = [];
    const edits = createCanvasEdits({
        mutate: () => (++calls === 1 ? first.promise : second.promise),
        onManifest: () => markers.push(edits.isOwnRemoval('cmp_1')),
        onFailure: () => {},
    });
    const one = edits.enqueue('session', remove);
    const two = edits.enqueue('session', remove);

    first.resolve(manifest);
    await one;
    assert.equal(edits.isOwnRemoval('cmp_1'), true);
    second.resolve(manifest);
    await two;
    assert.deepEqual(markers, [true, true]);
    assert.equal(edits.isOwnRemoval('cmp_1'), false);
});

test('an acknowledged stale response cannot suppress a future agent removal', async () => {
    const edits = createCanvasEdits({
        mutate: async () => manifest,
        // The hook can ignore this response when a newer manifest already arrived.
        onManifest: () => {},
        onFailure: () => {},
    });

    await edits.enqueue('session', remove);
    await edits.enqueue('session', add);
    assert.equal(edits.isOwnRemoval('cmp_1'), false);
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
    assert.equal(edits.isOwnRemoval('cmp_1'), false);
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
