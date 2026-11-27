import assert from 'node:assert/strict';
import test from 'node:test';

import { grownWidth, holdRow } from '../panelGrow.ts';

test('holdRow scrolls to keep the row in place when the range allows it', () => {
    // The row sat 100 px down the panel and now starts 300 px into the content.
    assert.deepEqual(holdRow({ before: 100, after: 300, content: 1200, viewport: 600 }), {
        scrollTop: 200,
        top: 0,
        foot: 0,
    });
});

test('holdRow holds space above when the row would need a negative scroll', () => {
    assert.deepEqual(holdRow({ before: 250, after: 180, content: 1200, viewport: 600 }), {
        scrollTop: 0,
        top: 70,
        foot: 0,
    });
});

test('holdRow holds only the foot space that passes the panel foot', () => {
    // A 500 px page in a 600 px panel: scrolling 40 px needs 140 px more below.
    assert.deepEqual(holdRow({ before: 60, after: 100, content: 500, viewport: 600 }), {
        scrollTop: 40,
        top: 0,
        foot: 140,
    });
    // A long page near its end: the range falls 30 px short.
    assert.deepEqual(holdRow({ before: 0, after: 630, content: 1200, viewport: 600 }), {
        scrollTop: 630,
        top: 0,
        foot: 30,
    });
});

const strip = { restLeft: 1114, grownLeft: 979, right: 1429, panel: { top: 79, bottom: 889 } };
const card = (left: number, right: number, top = 326, bottom = 686) => ({
    left,
    right,
    top,
    bottom,
});

test('grownWidth grows into a strip with no card in it', () => {
    assert.equal(grownWidth({ ...strip, cards: [card(34, 529), card(551, 960)] }), 450);
});

test('grownWidth keeps the rest width when a card reaches into the strip', () => {
    assert.equal(grownWidth({ ...strip, cards: [card(34, 529), card(551, 1046)] }), 315);
});

test('grownWidth ignores a card that only touches the strip or lies out of the panel height', () => {
    assert.equal(
        grownWidth({ ...strip, cards: [card(551, 979), card(551, 1046, 900, 1200)] }),
        450,
    );
});
