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
import { placeCard, renameId, renameKey, takenOver, withReplacedCard } from '../cardReplace.ts';
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
