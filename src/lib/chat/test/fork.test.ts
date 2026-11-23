/**
 * `fork.ts`: a conversation forked from another holds none of its turns or
 * cards, so its inherited cards stay on the page through Remove, Add and the
 * new session's manifests.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasWidgetsOf, isHarnessCard, savedCanvasWidgetsOf } from '../canvas.ts';
import { openedSave } from '../fork.ts';
import type { SavedConversation } from '../history.ts';

// A fork saved before forks named their local cards: no session, the
// source's cards, and no `localIds`.
const devFork: SavedConversation = {
    id: 'fork',
    sessionId: null,
    title: 'Fork',
    updatedAt: 0,
    messages: [
        { role: 'user', text: 'question 1', harnessTurn: 1 },
        { role: 'bot', text: 'reply 1' },
    ],
    widgets: [
        { kind: 'text', id: 'cmp_old', title: 'Old', body: '', turn: 1 },
        { kind: 'text', id: 'cmp_pinned', title: 'Pinned', body: '', turn: 1 },
        { kind: 'text', id: 'cmp_latest', title: 'Latest', body: '', turn: 2 },
    ],
    turnCount: 2,
    pinnedIds: ['cmp_pinned'],
    removedIds: [],
    layout: {},
};

const shown = (saved: SavedConversation) => canvasWidgetsOf(saved).map((widget) => widget.id);

test('Remove and Add work on the inherited cards of a fork saved before forks named their local cards', () => {
    const opened = openedSave(devFork);

    assert.deepEqual(shown(opened), ['cmp_pinned', 'cmp_latest']);
    assert.equal(isHarnessCard(opened, 'cmp_latest'), false);
    assert.equal(isHarnessCard(opened, 'cmp_old'), false);

    // Remove and Add change removedIds alone, with no harness edit.
    const removed = { ...opened, removedIds: [...opened.removedIds, 'cmp_latest'] };

    assert.deepEqual(shown(removed), ['cmp_pinned']);
    assert.deepEqual(
        shown({ ...removed, removedIds: removed.removedIds.filter((id) => id !== 'cmp_old') }),
        ['cmp_old', 'cmp_pinned'],
    );
    // Its messages answer the source's turns, not the fork's session.
    assert.ok(opened.messages.every((message) => message.inherited));
});

test('a fork saved before forks named their local cards keeps its inherited cards once its own thread draws', () => {
    const opened = openedSave(devFork);
    const drawn = {
        ...opened,
        widgets: [
            ...opened.widgets,
            { kind: 'text' as const, id: 'cmp_new', title: 'New', body: '', turn: 3 },
        ],
        canvas: { compositionId: 'cps_fork', revision: 1, ids: ['cmp_new'] },
    };

    assert.deepEqual(shown(drawn), ['cmp_pinned', 'cmp_latest', 'cmp_new']);
});

test('a save whose baseline predates manifest pins keeps the pinned and grace cards it showed', () => {
    // The harness's manifest held only the latest turn's card; the page
    // showed the pinned and grace cards beside it by the turn rule.
    const save: SavedConversation = {
        ...devFork,
        sessionId: 'conversation_1',
        widgets: [
            ...devFork.widgets,
            { kind: 'text', id: 'cmp_grace', title: 'Grace', body: '', turn: 1 },
        ],
        graceIds: ['cmp_grace'],
        graceTurn: 2,
        canvas: { compositionId: 'cps_1', revision: 3, ids: ['cmp_latest'] },
    };
    const opened = openedSave(save);

    assert.deepEqual(shown(opened), ['cmp_pinned', 'cmp_latest', 'cmp_grace']);
    assert.equal(isHarnessCard(opened, 'cmp_pinned'), false);
    assert.equal(isHarnessCard(opened, 'cmp_latest'), true);
    // A share or an embed of the save shows what Studio shows.
    assert.deepEqual(
        savedCanvasWidgetsOf(save).map((widget) => widget.id),
        shown(opened),
    );
    // A card the user removed stays off.
    assert.deepEqual(shown(openedSave({ ...save, removedIds: ['cmp_grace'] })), [
        'cmp_pinned',
        'cmp_latest',
    ]);
    // A baseline that carries the manifest's pins shows what it holds.
    const pinned = { ...save, canvas: { ...save.canvas!, pinned: [] } };

    assert.equal(openedSave(pinned), pinned);
});
