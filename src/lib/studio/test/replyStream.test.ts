/**
 * `replyStream.ts`: the streaming reply's words held outside the transcript,
 * read against the transcript's commit they were appended after.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createReplyStore, type ReplyStream, streamedText } from '../replyStream.ts';

test('a transcript drawn at a commit gets the pieces appended at it or later', () => {
    const store = createReplyStore();

    // Commit 1 wrote the first delta. Two more arrive.
    store.append(3, 1, 'is ');
    store.append(3, 1, 'growing');
    assert.equal(store.since(3, 1), 'is growing');

    // Commit 2 takes them. A delta arrives before commit 2 is drawn.
    store.append(3, 2, '.');
    // The transcript still drawn at commit 1 lacks all three.
    assert.equal(store.since(3, 1), 'is growing.');
    // Drawn at commit 2, it lacks only the last.
    assert.equal(store.since(3, 2), '.');
    // Another turn's reply has none.
    assert.equal(store.since(4, 1), '');
});

test('pruning drops only the pieces a commit holds, and tells no reader', () => {
    const store = createReplyStore();
    let heard = 0;

    store.subscribe(() => {
        heard += 1;
    });
    store.append(1, 1, 'a');
    store.append(1, 2, 'b');
    assert.equal(heard, 2);

    store.prune(2);
    assert.equal(heard, 2);
    assert.equal(store.since(1, 2), 'b');
    assert.equal(store.since(1, 0), 'b');
});

test('an unsubscribed reader hears nothing, and an empty piece is no change', () => {
    const store = createReplyStore();
    let heard = 0;
    const stop = store.subscribe(() => {
        heard += 1;
    });

    store.append(1, 1, '');
    assert.equal(heard, 0);
    stop();
    store.append(1, 1, 'a');
    assert.equal(heard, 0);
});

test('streamedText adds the pieces since the stream’s commit to a turn’s committed text', () => {
    const store = createReplyStore();
    const stream: ReplyStream = { store, at: 5 };

    store.append(2, 4, 'taken by commit 5 ');
    store.append(2, 5, 'words');
    assert.equal(streamedText(stream, 2, 'The answer '), 'The answer words');
    assert.equal(streamedText(stream, 3, 'Done.'), 'Done.');
    assert.equal(streamedText(undefined, 2, 'The answer '), 'The answer ');
});

test('turns lists the turns with pieces, oldest first', () => {
    const store = createReplyStore();

    store.append(2, 1, 'a');
    store.append(3, 1, 'b');
    store.append(2, 2, 'c');
    assert.deepEqual(store.turns(), [2, 3]);
    store.prune(2);
    assert.deepEqual(store.turns(), [2]);
});
