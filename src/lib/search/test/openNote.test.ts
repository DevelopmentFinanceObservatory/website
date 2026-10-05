import assert from 'node:assert/strict';
import test from 'node:test';

import {
    nextNote,
    readNote,
    sendNote,
    subscribeNote,
    type NoteEvent,
    type OpenNote,
} from '../openNote.ts';

const shown = (id: string): OpenNote => ({ id, pinned: false });
const pinned = (id: string): OpenNote => ({ id, pinned: true });
const on = (type: NoteEvent['type'], id: string): NoteEvent => ({ type, id });

const cases: [string, OpenNote, NoteEvent, OpenNote][] = [
    ['show opens a note', null, on('show', 'a'), shown('a')],
    ['show replaces another shown note', shown('a'), on('show', 'b'), shown('b')],
    ['show replaces a pinned note', pinned('a'), on('show', 'b'), shown('b')],
    ['show keeps its own pin', pinned('a'), on('show', 'a'), pinned('a')],
    ['hide closes its own shown note', shown('a'), on('hide', 'a'), null],
    ['hide keeps its own pinned note', pinned('a'), on('hide', 'a'), pinned('a')],
    ['hide leaves another note open', shown('b'), on('hide', 'a'), shown('b')],
    ['toggle pins a closed note', null, on('toggle', 'a'), pinned('a')],
    ['toggle pins its own shown note', shown('a'), on('toggle', 'a'), pinned('a')],
    ['toggle unpins and closes its own pinned note', pinned('a'), on('toggle', 'a'), null],
    ['toggle replaces another pinned note', pinned('b'), on('toggle', 'a'), pinned('a')],
    ['close closes its own pinned note', pinned('a'), on('close', 'a'), null],
    ['close leaves another note open', pinned('b'), on('close', 'a'), pinned('b')],
];

for (const [name, note, event, expected] of cases) {
    test(`nextNote: ${name}`, () => {
        assert.deepEqual(nextNote(note, event), expected);
    });
}

test('sendNote notifies subscribers only when the open note changes', () => {
    let calls = 0;
    const unsubscribe = subscribeNote(() => {
        calls += 1;
    });

    sendNote(on('toggle', 'a'));
    sendNote(on('hide', 'a'));
    sendNote(on('show', 'b'));
    sendNote(on('close', 'b'));
    unsubscribe();
    sendNote(on('show', 'c'));

    assert.equal(calls, 3);
    assert.deepEqual(readNote(), shown('c'));
    sendNote(on('close', 'c'));
});
