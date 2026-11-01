import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    cardPressAction,
    dragLifts,
    type PressAction,
    pressAction,
    type PressZone,
    pressZone,
} from '../../../components/organisms/Studio/canvas/cardPress.ts';

describe('pressAction', () => {
    const cases: [string, PressZone, boolean, PressAction][] = [
        ['mouse', 'handle', false, 'drag'],
        ['pen', 'handle', false, 'drag'],
        ['touch', 'handle', false, 'drag'],
        ['mouse', 'content', false, 'none'],
        ['pen', 'content', false, 'none'],
        ['touch', 'content', false, 'pan'],
        ['mouse', 'control', false, 'none'],
        ['touch', 'control', false, 'none'],
        ['mouse', 'handle', true, 'pan'],
        ['mouse', 'content', true, 'pan'],
        ['touch', 'content', true, 'pan'],
        ['mouse', 'control', true, 'none'],
    ];

    for (const [pointerType, zone, readOnly, expected] of cases) {
        it(`${pointerType} on ${zone}${readOnly ? ', read-only' : ''} → ${expected}`, () => {
            assert.equal(pressAction({ pointerType, zone, readOnly }), expected);
        });
    }
});

describe('dragLifts', () => {
    it('waits for a 4px move', () => {
        assert.equal(dragLifts(0, 0), false);
        assert.equal(dragLifts(3, 2), false);
        assert.equal(dragLifts(4, 0), true);
        assert.equal(dragLifts(-3, -3), true);
    });
});

// A stand-in element: its ancestry is a list of selector-matching tags, so
// `closest` answers whether the element or an ancestor carries one.
type Fake = {
    tagName: string;
    marks: string[];
    parent: Fake | null;
    closest: (selector: string) => Fake | null;
    hasAttribute: (name: string) => boolean;
};

const MARKS: Record<string, string> = {
    '[data-card-box]': 'box',
    '[data-drag-handle]': 'handle',
};

const ATTRIBUTES: Record<string, string> = {
    'data-draggable': 'draggable',
    'data-card-frame': 'frame',
};

const fake = (tagName: string, marks: string[], parent: Fake | null): Fake => {
    const node: Fake = {
        tagName,
        marks,
        parent,
        closest: (selector) => {
            const wanted = MARKS[selector];

            for (let at: Fake | null = node; at; at = at.parent) {
                const hit = wanted
                    ? at.marks.includes(wanted)
                    : selector.split(', ').includes(at.tagName.toLowerCase());

                if (hit) {
                    return at;
                }
            }

            return null;
        },
        hasAttribute: (name) => marks.includes(ATTRIBUTES[name] ?? ''),
    };

    return node;
};

describe('pressZone and cardPressAction', () => {
    const board = fake('DIV', [], null);
    const box = fake('DIV', ['box', 'draggable'], board);
    const article = fake('ARTICLE', [], box);
    const head = fake('HEADER', ['handle'], article);
    const title = fake('P', [], head);
    const pin = fake('BUTTON', [], head);
    const plot = fake('CANVAS', [], fake('DIV', [], article));

    it('names the zone under the press', () => {
        assert.equal(pressZone(box, box), 'handle');
        assert.equal(pressZone(article, box), 'handle');
        assert.equal(pressZone(title, box), 'handle');
        assert.equal(pressZone(pin, box), 'control');
        assert.equal(pressZone(plot, box), 'content');
    });

    it('moves a text card by the gaps in its wrapper, and keeps its text content', () => {
        const textInner = fake('DIV', ['frame'], fake('ARTICLE', [], box));
        const textHead = fake('HEADER', ['handle'], textInner);
        const textBody = fake('P', [], textInner);

        assert.equal(pressZone(textInner, box), 'handle');
        assert.equal(pressZone(fake('P', [], textHead), box), 'handle');
        assert.equal(pressZone(textBody, box), 'content');
        assert.equal(pressZone(fake('STRONG', [], textBody), box), 'content');
    });

    it('routes a press from the DOM', () => {
        assert.equal(cardPressAction({ target: board as never, pointerType: 'mouse' }), null);
        assert.equal(cardPressAction({ target: title as never, pointerType: 'mouse' }), 'drag');
        assert.equal(cardPressAction({ target: plot as never, pointerType: 'mouse' }), 'none');
        assert.equal(cardPressAction({ target: plot as never, pointerType: 'touch' }), 'pan');
    });

    it('pans from a card the reader cannot move', () => {
        const still = fake('DIV', ['box'], board);
        const text = fake('P', [], fake('ARTICLE', [], still));

        assert.equal(cardPressAction({ target: text as never, pointerType: 'mouse' }), 'pan');
    });
});
