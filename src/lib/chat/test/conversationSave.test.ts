/**
 * The save route stores a document only when its ids are conversation ids
 * the text primary keys that hold them accept (`isSaveableConversation` in
 * `conversationSave.ts`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConversation } from '../history.ts';
import { MAX_CONVERSATION_ID_CHARS } from '../../studio/studioAccess.ts';
import { isSaveableConversation } from '../conversationSave.ts';

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
