/**
 * `cardReplace.ts`: a card whose `component.created` frame names the card it
 * `replaces` takes that card's place and settings (and on a Change unit turn
 * its turn), so the answer's other cards stay on the canvas and none is
 * reported hidden; the agent's removals wait for the turn's end.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canvasWidgetsOf } from '../../chat/canvas.ts';
import { replacementsOf, standingFor } from '../cardIdentity.ts';
import {
    placeCard,
    renameId,
    renameKey,
    replacedChain,
    standingTarget,
    takenOver,
    withReplacedCard,
} from '../cardReplace.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated } from '../wire.ts';

// Copied from the harness's wire fixtures
// (`services/harness/tests/wire_fixtures/studio` in dfo-ai).
const created = JSON.parse(
    readFileSync(
        new URL('./fixtures/event-19-component-unit-change.json', import.meta.url),
        'utf8',
    ),
) as ComponentCreated;

const drawn = (id: string) => {
    const widget = widgetFromComponent({ ...created, component_id: id, replaces: null });

    assert.ok(widget);

    return widget;
};

// Turn 1's answer drew `old` and `sibling`; turn 2 (a Change unit) redrew
// `old` as the fixture's card.
const replaced = created.replaces ?? '';
const answer = [
    { ...drawn(replaced), turn: 1 },
    { ...drawn('cmp_sibling'), turn: 1 },
];
const replacement = widgetFromComponent(created);

assert.ok(replacement);

const after = placeCard(
    answer,
    { ...replacement, turn: 2 },
    { replaces: created.replaces, keepTurn: true },
);

test('placeCard: a Change unit replacement takes the old card place and turn', () => {
    assert.deepEqual(
        after.map((card) => [card.id, card.turn]),
        [
            [created.component_id, 1],
            ['cmp_sibling', 1],
        ],
    );
});

test('placeCard: the answer sibling stays on the canvas and nothing is hidden', () => {
    const shown = canvasWidgetsOf({ widgets: after, pinnedIds: [], removedIds: [] }).map(
        (card) => card.id,
    );
    const hidden = after.filter((card) => !shown.includes(card.id));

    assert.deepEqual(shown, [created.component_id, 'cmp_sibling']);
    assert.deepEqual(hidden, []);
});

test('placeCard: an edit turn replacement joins the new turn beside its other card', () => {
    // Turn 2 edits `old`: the harness redraws it under a new id and also
    // draws `cmp_new`. Both are turn 2's answer, so both stay shown.
    const redrawn = placeCard(answer, { ...replacement, turn: 2 }, { replaces: replaced });
    const withNew = placeCard(redrawn, { ...drawn('cmp_new'), turn: 2 }, {});
    const shown = canvasWidgetsOf({ widgets: withNew, pinnedIds: [], removedIds: [] }).map(
        (card) => card.id,
    );

    assert.deepEqual(
        withNew.map((card) => [card.id, card.turn]),
        [
            [created.component_id, 2],
            ['cmp_sibling', 1],
            ['cmp_new', 2],
        ],
    );
    assert.deepEqual(shown, [created.component_id, 'cmp_new']);
});

test('placeCard: a frame that replaces its own id updates the card in place', () => {
    const own = placeCard(
        answer,
        { ...drawn(replaced), turn: 2 },
        { replaces: replaced, keepTurn: true },
    );

    assert.deepEqual(
        own.map((card) => [card.id, card.turn]),
        [
            [replaced, 2],
            ['cmp_sibling', 1],
        ],
    );
});

test('takenOver: the replaced card, else the edited one, never the card itself', () => {
    const id = created.component_id;

    assert.equal(takenOver(id, { replaces: replaced, editing: 'cmp_sibling' }), replaced);
    assert.equal(takenOver(id, { editing: replaced }), replaced);
    assert.equal(takenOver(id, { replaces: id, editing: replaced }), null);
    assert.equal(takenOver(id, { editing: id }), null);
    assert.equal(takenOver(id, {}), null);
});

test('placeCard: an edit with no `replaces` moves the card into the new turn', () => {
    const edited = placeCard(answer, { ...replacement, turn: 2 }, { editing: replaced });

    assert.deepEqual(
        edited.map((card) => [card.id, card.turn]),
        [
            [created.component_id, 2],
            ['cmp_sibling', 1],
        ],
    );
});

test('placeCard: a replaced card not held here leaves the new card at the end', () => {
    const lone = placeCard([answer[1]!], { ...replacement, turn: 2 }, { replaces: replaced });

    assert.deepEqual(
        lone.map((card) => [card.id, card.turn]),
        [
            ['cmp_sibling', 1],
            [created.component_id, 2],
        ],
    );
});

test('renameId and renameKey: the changed card keeps its pin, place, size, title and note', () => {
    const id = created.component_id;
    const rect = { col: 4, row: 2, w: 6, h: 5 };
    const sibling = { col: 0, row: 0, w: 4, h: 4 };
    assert.deepEqual(renameId([replaced, 'cmp_sibling'], replaced, id), [id, 'cmp_sibling']);
    assert.deepEqual(renameKey({ [replaced]: rect, cmp_sibling: sibling }, replaced, id), {
        cmp_sibling: sibling,
        [id]: rect,
    });
    assert.deepEqual(renameKey({ [replaced]: 'Debt service' }, replaced, id), {
        [id]: 'Debt service',
    });
});

test('renameId and renameKey: a card they do not hold leaves the same object', () => {
    const ids = ['cmp_sibling'];
    const notes = { cmp_sibling: 'Note' };

    assert.equal(renameId(ids, replaced, created.component_id), ids);
    assert.equal(renameKey(notes, replaced, created.component_id), notes);
});

test('withReplacedCard: before the next manifest, the canvas shows the replacement once and not the old card', () => {
    const held = {
        compositionId: 'cps_1',
        revision: 3,
        ids: [replaced, 'cmp_sibling'],
        pinned: [replaced],
        revisions: { [replaced]: 1, cmp_sibling: 1 },
    };
    const canvas = withReplacedCard(held, replaced, created.component_id);
    const shown = canvasWidgetsOf({ widgets: after, pinnedIds: [], removedIds: [], canvas }).map(
        ({ id }) => id,
    );

    assert.deepEqual(shown, [created.component_id, 'cmp_sibling']);
    assert.deepEqual(canvas?.pinned, [created.component_id]);
    assert.deepEqual(canvas?.revisions, { cmp_sibling: 1 });
    // The next manifest is still taken: the revision is the held one.
    assert.equal(canvas?.revision, 3);
    assert.equal(withReplacedCard(held, 'cmp_elsewhere', 'cmp_new'), held);
});

test('a replaced card is followed forward to the card standing in its place, and back along its chain', () => {
    const replaced = { c2: 'c1', c3: 'c2' };

    assert.equal(standingFor('c1', new Set(['c3']), replaced), 'c3');
    assert.equal(standingFor('c1', new Set(['c1']), replaced), 'c1');
    assert.equal(standingFor('c1', new Set(['x']), replaced), null);
    assert.equal(standingFor('a', new Set(['x']), { a: 'b', b: 'a' }), null);
    assert.deepEqual(replacedChain('c3', replaced), ['c3', 'c2', 'c1']);
    assert.deepEqual(replacedChain('a', { a: 'b', b: 'a' }), ['a', 'b']);
});

test('placeCard records the question that made a chain’s first card, its ids and the card changes that drew it, through every replacement', () => {
    // b is a question's redraw of a; c and d are card changes (turns 5 and 7).
    const first = placeCard([{ id: 'a', turn: 1 }], { id: 'b', turn: 3 }, { replaces: 'a' });
    const second = placeCard(first, { id: 'c', turn: 5 }, { replaces: 'b', keepTurn: true });
    const third = placeCard(second, { id: 'd', turn: 7 }, { replaces: 'c', keepTurn: true });
    // A card redrawn under its own id keeps what it records.
    const updated = placeCard(third, { id: 'd', turn: 8 }, {});

    assert.deepEqual(first, [{ id: 'b', turn: 3, madeIn: 1, replaced: ['a'] }]);
    assert.deepEqual(second, [
        { id: 'c', turn: 3, madeIn: 1, replaced: ['b', 'a'], changedIn: [5] },
    ]);
    assert.deepEqual(updated, [
        { id: 'd', turn: 8, madeIn: 1, replaced: ['c', 'b', 'a'], changedIn: [5, 7] },
    ]);
    assert.deepEqual(replacementsOf(updated), { d: 'c', c: 'b', b: 'a' });
});

test('a follow-up target follows its card to the replacement, and goes when none stands', () => {
    const target = { id: 'c1', title: 'Aid' };
    const replaced = { c2: 'c1' };
    const titles: Record<string, string> = { c1: 'Aid', c2: 'Aid, 2015 to 2020' };
    const titleOf = (id: string) => titles[id] ?? 'Card';

    assert.equal(standingTarget(target, new Set(['c1']), replaced, titleOf), target);
    assert.deepEqual(standingTarget(target, new Set(['c2']), replaced, titleOf), {
        id: 'c2',
        title: 'Aid, 2015 to 2020',
    });
    assert.deepEqual(
        standingTarget(target, new Set(['c1']), replaced, () => 'Renamed'),
        {
            id: 'c1',
            title: 'Renamed',
        },
    );
    assert.equal(standingTarget(target, new Set(['x']), replaced, titleOf), null);
    assert.equal(standingTarget(null, new Set(['c1']), replaced, titleOf), null);
});

test('a card a question draws in a changed card’s place starts its history afresh', () => {
    const changed = placeCard(
        [{ id: 'a', turn: 1 }],
        { id: 'b', turn: 2 },
        { replaces: 'a', keepTurn: true, values: (card) => ({ years: card.id }) },
    );
    const asked = placeCard(changed, { id: 'c', turn: 3 }, { replaces: 'b' });

    assert.deepEqual(changed, [
        {
            id: 'b',
            turn: 1,
            madeIn: 1,
            replaced: ['a'],
            changedIn: [2],
            before: { years: 'a' },
            after: { years: 'b' },
        },
    ]);
    assert.deepEqual(asked, [{ id: 'c', turn: 3, madeIn: 1, replaced: ['b', 'a'] }]);
});
