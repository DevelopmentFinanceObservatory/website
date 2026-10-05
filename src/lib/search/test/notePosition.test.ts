import assert from 'node:assert/strict';
import test from 'node:test';

import { notePosition, noteShown } from '../notePosition.ts';

const note = { width: 260, height: 120 };
const box = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
});

const cases: [string, Parameters<typeof notePosition>[0], { top: number; left: number }][] = [
    [
        'beside the panel on the right, at the mark',
        {
            panel: box(40, 300, 300, 400),
            mark: box(320, 340, 10, 10),
            note,
            screen: { width: 1280, height: 800 },
        },
        { left: 348, top: 340 },
    ],
    [
        'on the left when the right edge is too close',
        {
            panel: box(900, 300, 300, 400),
            mark: box(1180, 340, 10, 10),
            note,
            screen: { width: 1280, height: 800 },
        },
        { left: 632, top: 340 },
    ],
    [
        'raised to stay above the bottom edge',
        {
            panel: box(40, 300, 300, 480),
            mark: box(320, 760, 10, 10),
            note,
            screen: { width: 1280, height: 800 },
        },
        { left: 348, top: 664 },
    ],
    [
        'under the mark on a screen with no room beside the panel',
        {
            panel: box(16, 200, 300, 400),
            mark: box(296, 240, 10, 10),
            note,
            screen: { width: 390, height: 844 },
        },
        { left: 114, top: 258 },
    ],
    [
        'over the mark when there is no room under it either',
        {
            panel: box(16, 400, 300, 420),
            mark: box(296, 780, 10, 10),
            note,
            screen: { width: 390, height: 844 },
        },
        { left: 114, top: 652 },
    ],
];

for (const [description, input, expected] of cases) {
    test(`notePosition: ${description}`, () => {
        assert.deepEqual(notePosition(input), expected);
    });
}

test('noteShown reads checkVisibility, else whether the note has a layout box', () => {
    const boxes = (count: number) => () => ({ length: count }) as DOMRectList;

    assert.equal(noteShown({ getClientRects: boxes(1), checkVisibility: () => false }), false);
    assert.equal(noteShown({ getClientRects: boxes(0), checkVisibility: () => true }), true);
    // A browser before Safari 17.4 has no checkVisibility.
    assert.equal(noteShown({ getClientRects: boxes(1) }), true);
    assert.equal(noteShown({ getClientRects: boxes(0) }), false);
});
