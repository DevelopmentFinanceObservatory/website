import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import gallery from '../../../content/gallery/index.ts';
import type { SavedConversation } from '../history.ts';
import { LIVE_CARD_TITLE, liveSlotsOf, studioShareBody } from '../sharePayload.ts';

const FRAME = { spec_id: 'spec_aid', content_version: 'cv_1' };

const chart = (id: string, extra: Record<string, unknown> = {}) => ({
    kind: 'chart',
    id,
    turn: 1,
    chartType: 'line',
    title: `Chart ${id}`,
    categories: ['2024'],
    series: [{ label: 'Kenya', values: [1] }],
    ...extra,
});

const saved = (widgets: unknown[]): SavedConversation =>
    ({
        id: 'conv-1',
        sessionId: 'harness-session',
        componentRefs: [{ component_id: 'cmp_private', revision: 1 }],
        title: 'Aid to Kenya',
        updatedAt: 1,
        messages: [{ role: 'user', text: 'aid' }],
        widgets,
        activity: [],
        turnCount: 1,
        pinnedIds: [],
        removedIds: [],
        layout: {},
        textCards: [],
    }) as unknown as SavedConversation;

test('a live canvas sends a slot per shown data card and holds every data card', () => {
    const body = studioShareBody({
        saved: saved([
            chart('c1', { ref: { component_id: 'cmp_a', revision: 2 }, frame: FRAME }),
            chart('c2', { ref: { component_id: 'cmp_b', revision: 1 } }),
        ]),
        kind: 'canvas',
        mode: 'live',
    });

    assert.ok(!('unslotted' in body));
    assert.equal(body.latest, true);
    assert.deepEqual(body.cards, [
        { component_id: 'cmp_a', revision: 2 },
        { component_id: 'cmp_b', revision: 1 },
    ]);
    assert.deepEqual(body.payload['widgets'], [
        { kind: 'chart', id: 'c1', turn: 1, chartType: 'line', horizontal: undefined, slot: 0 },
        { kind: 'chart', id: 'c2', turn: 1, chartType: 'line', horizontal: undefined, slot: 1 },
    ]);
    // The canvas share carries no transcript and no owner session.
    assert.deepEqual(body.payload['messages'], []);
    assert.equal(body.payload['sessionId'], null);
    assert.deepEqual(body.payload['componentRefs'], []);
});

test('a live share is refused with the shown data cards that have no ref', () => {
    const canvas = saved([
        chart('c1', { ref: { component_id: 'cmp_a', revision: 2 } }),
        chart('c2'),
    ]);

    assert.deepEqual(studioShareBody({ saved: canvas, kind: 'canvas', mode: 'live' }), {
        unslotted: ['c2'],
    });
    assert.throws(() => liveSlotsOf(canvas));
});

// The slots each live gallery item's prod share holds in dfo-apis, as the
// share migration gives them (`slotCanvas` on the stored canvas, read from
// the prod share pages). A card the canvas does not show has none.
const GALLERY_SLOTS: Record<string, Record<string, number>> = {
    upYQIqiL: { cmp_01M4R52ZWTCTQZM7Q2B6PYXJJB: 1, cmp_01M4R5306ZSAZTXVG7W6E2N51D: 2 },
    yvuDeHc4: { cmp_01M4RD1ZV835QM8N6KBM0APJEC: 1 },
    kng5T7HJ: { cmp_01M4R69BAF1F0P3DPX21F5ZVGX: 1 },
    '4M8WwZFV': { cmp_01M4RBGGH9Q0BAM1EN9GPTK1W1: 1, cmp_01M4RBRR2XE6TRP8HTAZH3WQNH: 2 },
};

test('a live gallery item refreshes each card from the slot its prod share holds', () => {
    const live = gallery.filter((item) => 'live' in item && item.live);

    assert.deepEqual(
        live.map((item) => item.sharedFrom).toSorted(),
        Object.keys(GALLERY_SLOTS).toSorted(),
    );

    for (const item of live) {
        const session = JSON.parse(
            readFileSync(
                new URL(`../../../content/gallery/${item.slug}.json`, import.meta.url),
                'utf8',
            ),
        ) as SavedConversation;

        assert.deepEqual(liveSlotsOf(session), GALLERY_SLOTS[item.sharedFrom], item.slug);
    }
});

test('a snapshot keeps a card with no ref as stored, with its numbers', () => {
    const stored = chart('c2');
    const body = studioShareBody({
        saved: saved([chart('c1', { ref: { component_id: 'cmp_a', revision: 2 } }), stored]),
        kind: 'canvas',
        mode: 'snapshot',
    });

    assert.ok(!('unslotted' in body));
    assert.equal(body.latest, false);
    assert.deepEqual(body.cards, [{ component_id: 'cmp_a', revision: 2 }]);
    assert.deepEqual((body.payload['widgets'] as unknown[])[1], stored);
});

test('a conversation sends no cards and its viewer copy, transcript included', () => {
    const body = studioShareBody({
        saved: saved([chart('c1', { ref: { component_id: 'cmp_a', revision: 2 } })]),
        kind: 'conversation',
        mode: 'snapshot',
    });

    assert.ok(!('unslotted' in body));
    assert.deepEqual(body.cards, []);
    assert.equal(body.title, 'Aid to Kenya');
    assert.deepEqual(body.payload['messages'], [{ role: 'user', text: 'aid' }]);
    assert.equal(body.payload['sessionId'], null);
});

test("a live card share's title is the sharer's own, never the card's", () => {
    const body = studioShareBody({
        saved: saved([chart('c1', { ref: { component_id: 'cmp_a', revision: 2 } })]),
        kind: 'card',
        mode: 'live',
        cardId: 'c1',
    });

    assert.ok(!('unslotted' in body));
    assert.equal(body.title, LIVE_CARD_TITLE);
    assert.deepEqual(body.cards, [{ component_id: 'cmp_a', revision: 2 }]);
});
