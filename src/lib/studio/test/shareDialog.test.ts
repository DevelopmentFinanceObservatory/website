/**
 * `shareDialog.ts`: the links of the Studio share dialog. What the site's
 * answer to a new share means, which cards a share holds, and how a live
 * link is offered or withdrawn.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConversation } from '../../chat/history.ts';
import type { ShareMode, StudioShareKind } from '../../chat/shareMode.ts';
import {
    openShareLink,
    readShareAnswer,
    type SharedCard,
    sharedDataCards,
    type ShareLink,
    shareLinkKey,
    shareModeFor,
    type ShareMint,
    snapshotShare,
    withdrawalText,
} from '../shareDialog.ts';

const CARDS: SharedCard[] = [
    { id: 'cmp_a', title: 'Aid to Ghana' },
    { id: 'cmp_b', title: 'Debt service' },
    { id: 'cmp_c', title: 'Remittances' },
];

// The site as the dialog meets it: `mint` is what creating the share comes
// to. Every share the dialog asks for is recorded.
const site = (mint: ShareMint) => {
    const created: [StudioShareKind, string | undefined, ShareMode][] = [];
    const open = async (kind: StudioShareKind, mode: ShareMode, cardId?: string) => {
        const reported: ShareLink[] = [];

        await openShareLink(
            {
                createShare: async (...args) => {
                    created.push(args);

                    return mint;
                },
            },
            { kind, cardId, mode },
            (link) => reported.push(link),
        );

        return reported;
    };

    return { open, created };
};

test('a link is kept apart by kind, card, and mode', () => {
    const keys = [
        shareLinkKey('canvas', undefined, 'live'),
        shareLinkKey('canvas', undefined, 'snapshot'),
        shareLinkKey('conversation', undefined, 'snapshot'),
        shareLinkKey('card', 'cmp_a', 'live'),
        shareLinkKey('card', 'cmp_a', 'snapshot'),
        shareLinkKey('card', 'cmp_b', 'live'),
    ];

    assert.equal(new Set(keys).size, keys.length);
});

test('the mode choice is offered for a canvas or a card only, and only when live is on offer', () => {
    const kinds = ['conversation', 'canvas', 'card', null] as const;

    // Off: no choice anywhere, and every link is a snapshot whatever was
    // chosen.
    assert.deepEqual(
        kinds.map((kind) => shareModeFor(false, kind, 'live')),
        kinds.map(() => ({ choice: false, mode: 'snapshot' })),
    );
    assert.deepEqual(
        kinds.map((kind) => shareModeFor(true, kind, 'live')),
        [
            { choice: false, mode: 'snapshot' },
            { choice: true, mode: 'live' },
            { choice: true, mode: 'live' },
            { choice: false, mode: 'snapshot' },
        ],
    );
    assert.deepEqual(shareModeFor(true, 'canvas', 'snapshot'), { choice: true, mode: 'snapshot' });
});

test("the site's answer to a new share is its id or the refusal it names", () => {
    const rows: [boolean, unknown, unknown][] = [
        [true, { id: 'Ab12Cd34', title: 'T' }, { id: 'Ab12Cd34' }],
        [
            false,
            {
                code: 'live_cards_blocked',
                retryable: false,
                cards: [
                    { id: 'cmp_b', reason: 'missing_ref' },
                    { id: 'cmp_c', reason: 'unsupported_frame' },
                ],
            },
            { refusal: { code: 'live_cards_blocked', cardIds: ['cmp_b', 'cmp_c'] } },
        ],
        [
            false,
            { code: 'live_too_many_cards', retryable: false, limit: 20, count: 23 },
            { refusal: { code: 'live_too_many_cards', limit: 20, count: 23 } },
        ],
        [false, { code: 'live_unavailable' }, { refusal: { code: 'live_unavailable' } }],
        [false, { code: 'share_limit' }, { refusal: { code: 'share_limit' } }],
        // What a second try can outlive, and every answer outside the contract.
        [
            false,
            { code: 'transient_unavailable', retryable: true },
            { refusal: { code: 'failed' } },
        ],
        [false, { code: 'unauthorized' }, { refusal: { code: 'failed' } }],
        // The old `{ error }` body is no longer read.
        [false, { error: 'share_limit' }, { refusal: { code: 'failed' } }],
        [false, { code: 'live_cards_blocked', cards: [] }, { refusal: { code: 'failed' } }],
        [false, null, { refusal: { code: 'failed' } }],
        [true, { title: 'no id' }, { refusal: { code: 'failed' } }],
    ];

    for (const [ok, body, expected] of rows) {
        assert.deepEqual(readShareAnswer(ok, body), expected);
    }
});

test('a share holds the data cards its kind keeps, under the titles their owner sees', () => {
    const chart = (id: string, title: string) => ({
        kind: 'chart' as const,
        id,
        turn: 1,
        chartType: 'line' as const,
        title,
        categories: [],
        series: [],
    });
    const saved: SavedConversation = {
        id: 'conv',
        sessionId: null,
        title: 'T',
        updatedAt: 1,
        messages: [],
        widgets: [
            chart('cmp_a', 'Made title A'),
            chart('cmp_b', 'Made title B'),
            chart('cmp_gone', 'Removed'),
            { kind: 'text', id: 'note', turn: 1, title: 'Note', body: 'Words' },
        ],
        turnCount: 1,
        pinnedIds: [],
        removedIds: ['cmp_gone'],
        layout: {},
        textCards: [{ kind: 'text', id: 'text', title: 'Text', body: 'Words' }],
        titles: { cmp_b: 'Owner title B' },
    };
    const titleOf = (widget: { kind: string }) =>
        'title' in widget ? String(widget.title) : 'untitled';

    assert.deepEqual(sharedDataCards(saved, 'canvas', undefined, titleOf), [
        { id: 'cmp_a', title: 'Made title A' },
        { id: 'cmp_b', title: 'Owner title B' },
    ]);
    assert.deepEqual(sharedDataCards(saved, 'card', 'cmp_b', titleOf), [
        { id: 'cmp_b', title: 'Owner title B' },
    ]);
    assert.deepEqual(sharedDataCards(saved, 'card', 'text', titleOf), []);
});

test('a link is ready as soon as the share exists, in the mode it was made in', async () => {
    for (const mode of ['snapshot', 'live'] as const) {
        const { open, created } = site({ id: 'Link0001', cards: CARDS });

        // The site checked a live share's cards before it made the share, so
        // the dialog reports the link once, with nothing more to ask.
        assert.deepEqual(await open('canvas', mode), [{ status: 'ready', id: 'Link0001', mode }]);
        assert.deepEqual(created, [['canvas', undefined, mode]]);
    }
});

test('a share the site refuses to make is withdrawn, failed or limited', async () => {
    const rows: [ShareMint, ShareLink][] = [
        [
            { refusal: { code: 'live_cards_blocked', cardIds: ['cmp_c', 'cmp_a'] }, cards: CARDS },
            {
                status: 'withdrawn',
                withdrawal: { reason: 'cards', cards: [CARDS[0]!, CARDS[2]!] },
            },
        ],
        [
            { refusal: { code: 'live_too_many_cards', limit: 20, count: 23 }, cards: CARDS },
            { status: 'withdrawn', withdrawal: { reason: 'limit', limit: 20, count: 23 } },
        ],
        [
            { refusal: { code: 'live_unavailable' }, cards: CARDS },
            { status: 'withdrawn', withdrawal: { reason: 'unavailable' } },
        ],
        [{ refusal: { code: 'failed' } }, { status: 'failed' }],
        [{ refusal: { code: 'share_limit' } }, { status: 'limited' }],
    ];

    for (const [mint, expected] of rows) {
        assert.deepEqual(await site(mint).open('canvas', 'live'), [expected]);
    }
});

test('the withdrawal sentence names every card in the way, and the limit with the count', () => {
    const text = withdrawalText({ reason: 'cards', cards: CARDS.slice(0, 2) }, false);

    assert.ok(text.includes('"Aid to Ghana"') && text.includes('"Debt service"'));
    assert.equal(text.includes('Remittances'), false);

    const limit = withdrawalText({ reason: 'limit', limit: 20, count: 23 }, false);

    assert.ok(limit.includes('20') && limit.includes('23'));
});

test("a live link is made a snapshot through the owner's PATCH", async () => {
    const requests: string[] = [];
    const bodies: unknown[] = [];
    const fetcher: typeof fetch = async (input, init) => {
        requests.push(`${init?.method} ${String(input)}`);
        bodies.push(JSON.parse(String(init?.body)));

        return Response.json({ id: 'Live0006', mode: 'snapshot' });
    };

    assert.equal(await snapshotShare(fetcher, 'Live0006'), true);
    assert.deepEqual(requests, ['PATCH /api/share/Live0006']);
    assert.deepEqual(bodies, [{ mode: 'snapshot' }]);
    assert.equal(await snapshotShare(async () => new Response(null, { status: 404 }), 'x'), false);
});
