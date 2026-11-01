/**
 * The cards listed under a chat answer: the collapsed row's label and the
 * ids its "Remove all" takes off the canvas.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cardsSummary, removableIds, type TurnCardRow } from '../turnCards.ts';

const rows: TurnCardRow[] = [
    { id: 'usd', title: 'Debt in US dollars', added: true },
    { id: 'eur', title: 'Debt in euro', added: false },
    { id: 'sdr', title: 'Debt in SDR', added: true },
];

test('cardsSummary: counts the cards, and the removed ones when there are any', () => {
    assert.equal(cardsSummary(rows), '3 cards, 1 removed');
    assert.equal(cardsSummary(rows.map((row) => ({ ...row, added: true }))), '3 cards');
    assert.equal(cardsSummary(rows.slice(0, 1)), '1 card');
});

test('removableIds: only the cards still on the canvas, in answer order', () => {
    assert.deepEqual(removableIds(rows), ['usd', 'sdr']);
    assert.deepEqual(removableIds(rows.map((row) => ({ ...row, added: false }))), []);
});
