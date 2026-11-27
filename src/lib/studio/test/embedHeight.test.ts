import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clampEmbedHeight,
    EMBED_HEIGHT_RANGE,
    embedHeightMessage,
    embedHeightRequest,
    embedHeightToSend,
    isEmbedHeightRequest,
    naturalEmbedHeight,
    readEmbedHeight,
} from '../embedHeight.ts';

test("an embed's natural height adds what sits outside its scroll container", () => {
    const cases = [
        // A canvas whose board ends at 900px, with a 28px live strip under the scroller.
        { contentBottom: 900, clientHeight: 592, viewportHeight: 620, natural: 928 },
        // Fractional layout rounds up, so the frame at that height fits the content.
        { contentBottom: 700.4, clientHeight: 620, viewportHeight: 620, natural: 701 },
    ];

    for (const { natural, ...sizes } of cases) {
        assert.equal(naturalEmbedHeight(sizes), natural, JSON.stringify(sizes));
    }
});

test('an embed posts when its content overflows or is below the height it last posted', () => {
    const cases = [
        // Fits and has posted nothing: the host's own height holds.
        { natural: 440, viewportHeight: 440, sent: null, posts: null },
        { natural: 300, viewportHeight: 440, sent: null, posts: null },
        // Overflows.
        { natural: 900, viewportHeight: 620, sent: null, posts: 900 },
        { natural: 1000, viewportHeight: 900, sent: 900, posts: 1000 },
        // Fits the frame it asked for.
        { natural: 900, viewportHeight: 900, sent: 900, posts: null },
        // Shrank: posts the smaller height, below the host's floor too.
        { natural: 700, viewportHeight: 900, sent: 900, posts: 700 },
        { natural: 400, viewportHeight: 620, sent: 700, posts: 400 },
        // Grew again but fits the floor the host keeps.
        { natural: 500, viewportHeight: 620, sent: 400, posts: null },
    ];

    for (const { posts, ...state } of cases) {
        assert.equal(embedHeightToSend(state), posts, JSON.stringify(state));
    }
});

test('an embed answers only a height request', () => {
    assert.equal(isEmbedHeightRequest(embedHeightRequest()), true);
    assert.equal(isEmbedHeightRequest(embedHeightMessage(900)), false);
    assert.equal(isEmbedHeightRequest(null), false);
    assert.equal(isEmbedHeightRequest(embedHeightRequest().type), false);
});

test('a host reads only an embed height message with a positive finite height', () => {
    const cases: [unknown, number | null][] = [
        [embedHeightMessage(928), 928],
        [{ ...embedHeightMessage(928), extra: true }, 928],
        [{ type: 'other', height: 928 }, null],
        [{ type: embedHeightMessage(1).type, height: '928' }, null],
        [{ type: embedHeightMessage(1).type, height: Number.NaN }, null],
        [{ type: embedHeightMessage(1).type, height: Number.POSITIVE_INFINITY }, null],
        [{ type: embedHeightMessage(1).type, height: -5 }, null],
        [{ type: embedHeightMessage(1).type, height: 0 }, null],
        ['928', null],
        [null, null],
        [928, null],
    ];

    for (const [data, height] of cases) {
        assert.equal(readEmbedHeight(data), height, JSON.stringify(data));
    }
});

test('a requested height is held to the range in whole pixels', () => {
    const { min, max } = EMBED_HEIGHT_RANGE;

    assert.equal(clampEmbedHeight(min - 100), min);
    assert.equal(clampEmbedHeight(max + 1), max);
    assert.equal(clampEmbedHeight(min + 10.6), min + 11);
});
