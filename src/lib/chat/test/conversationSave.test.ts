/**
 * The save route stores a document only when its ids are conversation ids
 * the text primary keys that hold them accept and it carries well-formed
 * save order fields or none (`isSaveableConversation` in
 * `conversationSave.ts`), and a stored
 * conversation reopens with a harness id those checks accept
 * (`readSavedConversation`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConversation } from '../history.ts';
import { MAX_CONVERSATION_ID_CHARS } from '../../studio/studioAccess.ts';
import {
    isSaveableConversation,
    MAX_SAVE_WRITER_CHARS,
    readSavedConversation,
} from '../conversationSave.ts';

const saved = (id: string, sessionId: string | null): SavedConversation => ({
    id,
    sessionId,
    title: 'Aid question',
    updatedAt: 1_800_000_000_000,
    messages: [],
    widgets: [],
    turnCount: 1,
    pinnedIds: [],
    removedIds: [],
    layout: {},
});

const longest = 'c'.repeat(MAX_CONVERSATION_ID_CHARS);
const tooLong = 'c'.repeat(MAX_CONVERSATION_ID_CHARS + 1);

for (const [name, id, sessionId, expected] of [
    ['ids at the limit', longest, longest, true],
    ['no harness conversation', 'conv-1', null, true],
    ['a conversation id over the limit', tooLong, 'harness-1', false],
    ['a harness conversation id over the limit', 'conv-1', tooLong, false],
    ['an empty conversation id', '', 'harness-1', false],
    ['an empty harness conversation id', 'conv-1', '', false],
    ['a NUL in the conversation id', 'conv\u00001', 'harness-1', false],
    ['a NUL in the harness conversation id', 'conv-1', 'harness\u00001', false],
] as const) {
    test(`a save with ${name} is ${expected ? 'kept' : 'refused'}`, () => {
        assert.equal(isSaveableConversation(id, saved(id, sessionId)), expected);
    });
}

test('a save naming another id, or a non-string harness id, is refused', () => {
    assert.equal(isSaveableConversation('conv-2', saved('conv-1', null)), false);
    assert.equal(
        isSaveableConversation('conv-1', { ...saved('conv-1', null), sessionId: 7 } as never),
        false,
    );
});

for (const [name, order, expected] of [
    ['no save order', {}, true],
    ['a writer and sequence 0', { saveWriter: 'page-1', saveSeq: 0 }, true],
    [
        'a writer at the length limit',
        { saveWriter: 'w'.repeat(MAX_SAVE_WRITER_CHARS), saveSeq: 3 },
        true,
    ],
    [
        'a writer over the length limit',
        { saveWriter: 'w'.repeat(MAX_SAVE_WRITER_CHARS + 1), saveSeq: 3 },
        false,
    ],
    ['an empty writer', { saveWriter: '', saveSeq: 3 }, false],
    ['a NUL in the writer', { saveWriter: 'page\u00001', saveSeq: 3 }, false],
    ['a numeric writer', { saveWriter: 7, saveSeq: 3 }, false],
    ['a writer without a sequence', { saveWriter: 'page-1' }, false],
    ['a sequence without a writer', { saveSeq: 3 }, false],
    ['a negative sequence', { saveWriter: 'page-1', saveSeq: -1 }, false],
    ['a fractional sequence', { saveWriter: 'page-1', saveSeq: 1.5 }, false],
    ['an unsafe sequence', { saveWriter: 'page-1', saveSeq: 2 ** 53 }, false],
    ['a string sequence', { saveWriter: 'page-1', saveSeq: '3' }, false],
] as const) {
    test(`a save with ${name} is ${expected ? 'kept' : 'refused'}`, () => {
        assert.equal(
            isSaveableConversation('conv-1', { ...saved('conv-1', null), ...order } as never),
            expected,
        );
    });
}

for (const [name, sessionId, expected] of [
    ['a saveable harness id', 'harness-1', 'harness-1'],
    ['no harness id', null, null],
    ['an empty harness id', '', null],
    ['a harness id over the limit', tooLong, null],
    ['a harness id with a control character', 'harness\u0001id', null],
    ['a harness id that is not a string', 42, null],
] as const) {
    test(`a stored conversation with ${name} reopens saveable`, () => {
        const stored = readSavedConversation(saved('conv-1', sessionId as never));

        assert.equal(stored.sessionId, expected);
        assert.equal(isSaveableConversation('conv-1', stored), true);
    });
}
