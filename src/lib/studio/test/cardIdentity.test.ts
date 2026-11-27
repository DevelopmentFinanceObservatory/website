import assert from 'node:assert/strict';
import test from 'node:test';

import { changeTurns, currentCard, standingFor, successorsOf } from '../cardIdentity.ts';

// c1 was replaced by c2, and c2 by c3.
const replaced = { c2: 'c1', c3: 'c2' };
const cards = [
    { id: 'c3', turn: 1 },
    { id: 'x', turn: 2 },
];

test('a card stands for every card of its chain while the canvas holds it, and none once it leaves', () => {
    for (const [name, onCanvas, ids] of [
        ['replaced twice', new Set(['c3', 'x']), ['c3', 'c3', 'c3']],
        ['taken off by a question', new Set(['x']), [null, null, null]],
        ['no manifest yet', null, ['c3', 'c3', 'c3']],
    ] as const) {
        assert.deepEqual(
            ['c1', 'c2', 'c3'].map((id) => currentCard(id, cards, replaced, onCanvas)?.id ?? null),
            ids,
            name,
        );
    }

    // A card the conversation no longer holds stands for nothing, and a card
    // outside any chain stands for itself.
    assert.equal(currentCard('c1', [{ id: 'x', turn: 2 }], replaced, null), null);
    assert.equal(currentCard('x', cards, replaced, null)?.id, 'x');
});

test('the walk forward ends on a loop in the replacement map', () => {
    const loop = { a: 'b', b: 'a' };

    assert.equal(standingFor('a', new Set<string>(), loop), null);
    assert.equal(standingFor('a', new Set(['b']), loop), 'b');
});

test('the successors of a replacement map are indexed once per map', () => {
    const first = successorsOf(replaced);

    assert.equal(successorsOf(replaced), first);
    assert.deepEqual(
        [...first],
        [
            ['c1', 'c2'],
            ['c2', 'c3'],
        ],
    );
    assert.notEqual(successorsOf({ ...replaced }), first);
});

test('the turns of card changes are the turns whose prompt is marked edit', () => {
    assert.deepEqual(
        [
            ...changeTurns([
                { role: 'user', turn: 1 },
                { role: 'bot' },
                { role: 'user', turn: 2, edit: { card: 'c1', row: 'years' } },
                { role: 'bot' },
                { role: 'user', edit: { card: 'c1', row: 'unit' } },
            ]),
        ],
        [2],
    );
});
