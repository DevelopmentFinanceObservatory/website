import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clampEmbedHeight,
    EMBED_HEIGHT_RANGE,
    embedHeightMessage,
    neededEmbedHeight,
    readEmbedHeight,
} from '../embedHeight.ts';

test('an embed asks for a height only while its content overflows', () => {
    const cases = [
        // A card that fills its frame.
        { scrollHeight: 440, clientHeight: 440, viewportHeight: 440, needed: null },
        // A canvas taller than the frame, with a 28px live strip outside the scroller.
        { scrollHeight: 900, clientHeight: 592, viewportHeight: 620, needed: 928 },
        // Fractional layout rounds up, so the grown frame no longer overflows.
        { scrollHeight: 700.4, clientHeight: 620, viewportHeight: 620, needed: 701 },
    ];

    for (const { needed, ...sizes } of cases) {
        assert.equal(neededEmbedHeight(sizes), needed, JSON.stringify(sizes));
    }
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
