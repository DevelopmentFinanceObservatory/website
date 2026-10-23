/**
 * `sharePrune.ts`: what each share kind keeps of a saved conversation. No
 * kind keeps the owner's harness conversation id.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConversation } from '../history.ts';
import { pruneForShare, shareForViewer, type ShareKind } from '../sharePrune.ts';

const saved: SavedConversation = {
    id: 'conv-1',
    sessionId: 'harness-session-1',
    componentRefs: [{ component_id: 'private-card', revision: 3 }],
    title: 'Aid to Kenya',
    updatedAt: 1,
    messages: [
        { role: 'user', text: 'How much aid did Kenya get?' },
        { role: 'bot', text: 'About 3 billion dollars.' },
    ],
    widgets: [],
    activity: [],
    turnCount: 3,
    pinnedIds: [],
    removedIds: [],
    layout: {},
    textCards: [{ kind: 'text', id: 'note-1', title: 'Note', body: 'Body' }],
};

const kinds: ShareKind[] = ['conversation', 'canvas', 'card', 'search'];

for (const kind of kinds) {
    test(`pruneForShare: a ${kind} share clears the session and its owned refs`, () => {
        const shared = pruneForShare(saved, kind, 'note-1');

        assert.equal(shared.sessionId, null);
        assert.deepEqual(shared.componentRefs, []);
    });

    test(`pruneForShare: a ${kind} share keeps no field outside SavedConversation`, () => {
        const sent = { ...saved, padding: 'x'.repeat(1024) } as SavedConversation;

        assert.equal('padding' in pruneForShare(sent, kind, 'note-1'), false);
    });
}

test('pruneForShare: a conversation share keeps the chat and the canvas', () => {
    assert.deepEqual(pruneForShare(saved, 'conversation'), {
        ...saved,
        sessionId: null,
        componentRefs: [],
    });
});

test("pruneForShare: the owner's saved conversation is left untouched", () => {
    pruneForShare(saved, 'conversation');

    assert.equal(saved.sessionId, 'harness-session-1');
    assert.deepEqual(saved.componentRefs, [{ component_id: 'private-card', revision: 3 }]);
});

test('pruneForShare: a canvas share drops the transcript', () => {
    const pruned = pruneForShare(saved, 'canvas');

    assert.deepEqual(pruned.messages, []);
    assert.deepEqual(pruned.textCards, saved.textCards);
});

test('pruneForShare: a card share keeps only that card', () => {
    const pruned = pruneForShare(saved, 'card', 'note-1');

    assert.deepEqual(pruned.textCards, saved.textCards);
    assert.deepEqual(pruned.messages, []);
    assert.equal(pruned.turnCount, 1);
});

test('shareForViewer: a stored conversation, canvas or card share reaches a viewer without its sessionId', () => {
    for (const kind of ['conversation', 'canvas', 'card'] as const) {
        const row = {
            id: 'abcd1234',
            kind,
            data: {
                sessionId: 'harness-1',
                componentRefs: saved.componentRefs,
                title: 'Chat',
                turnCount: 2,
            },
        };

        assert.deepEqual(shareForViewer(row), {
            id: 'abcd1234',
            kind,
            data: { sessionId: null, componentRefs: [], title: 'Chat', turnCount: 2 },
        });
        assert.equal(row.data.sessionId, 'harness-1');
    }
});

test('shareForViewer: a search share passes through', () => {
    const row = { id: 'srch0001', kind: 'search', data: { query: 'child mortality' } };

    assert.equal(shareForViewer(row), row);
});

test('pruneForShare: canvas and card shares store each card with its component revision', () => {
    const card = (id: string, revision: number) => ({
        kind: 'key_number' as const,
        id,
        label: 'Malaria grants',
        value: '441.9',
        ref: { component_id: id, revision },
        data: { columns: [{ key: 'value', label: 'Value' }], rows: [[441.9]] },
        turn: 2,
    });
    const withCards: SavedConversation = {
        ...saved,
        widgets: [card('cmp_a', 3), card('cmp_b', 1)],
    };

    assert.deepEqual(
        pruneForShare(withCards, 'canvas').widgets.map(
            (widget) => widget.kind !== 'text' && widget.ref,
        ),
        [
            { component_id: 'cmp_a', revision: 3 },
            { component_id: 'cmp_b', revision: 1 },
        ],
    );
    assert.deepEqual(
        pruneForShare(withCards, 'card', 'cmp_b').widgets.map(
            (widget) => widget.kind !== 'text' && widget.ref,
        ),
        [{ component_id: 'cmp_b', revision: 1 }],
    );
});
