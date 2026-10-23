/**
 * `shareDialog.ts`: the links of the Studio share dialog. What the site's
 * answer to a new share means, which cards a share holds, and how a live
 * link is checked, offered, or withdrawn.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConversation } from '../../chat/history.ts';
import type { ShareMode, StudioShareKind } from '../../chat/shareMode.ts';
import { liveFailureKind, type LiveDeps } from '../liveCards.ts';
import { AI_REFUSALS } from './fixtures/live-backend-stub.ts';
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

// A refresh answer that settles a card as ready.
const READY = {
    status: 'current',
    card: { component_id: 'cmp', revision: 1, payload: {}, fact_summary: {} },
};
const refused = (code: string) => ({ status: 'error', code });

type Reply = { status?: number; body: unknown };

// The site as the dialog meets it: `mint` is what creating the share comes
// to, and `refresh` scripts each card's refresh answers, one per call,
// repeating the last. Every request the dialog sends is recorded.
const site = (mint: ShareMint, refresh: Record<string, Reply[]> = {}) => {
    const requests: string[] = [];
    const bodies: unknown[] = [];
    const created: [StudioShareKind, string | undefined, ShareMode][] = [];
    const live: LiveDeps = {
        fetch: async (input, init) => {
            const path = String(input);

            requests.push(`${init?.method} ${path}`);
            bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined);

            const cardId = /cards\/([^/]+)\/refresh$/.exec(path)?.[1];

            if (!cardId) {
                return new Response(null, { status: 204 });
            }

            const replies = refresh[cardId]!;
            const reply = replies.length > 1 ? replies.shift()! : replies[0]!;

            return Response.json(reply.body, { status: reply.status ?? 200 });
        },
        now: () => 0,
        sleep: async () => {},
    };
    const open = async (kind: StudioShareKind, mode: ShareMode, cardId?: string) => {
        const reported: ShareLink[] = [];

        await openShareLink(
            {
                createShare: async (...args) => {
                    created.push(args);

                    return mint;
                },
                live,
            },
            { kind, cardId, mode },
            (link) => reported.push(link),
        );

        return reported;
    };

    return { open, requests, bodies, created };
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
                error: 'live_cards_blocked',
                cards: [
                    { id: 'cmp_b', reason: 'missing_ref' },
                    { id: 'cmp_c', reason: 'unsupported_frame' },
                ],
            },
            { refusal: { code: 'live_cards_blocked', cardIds: ['cmp_b', 'cmp_c'] } },
        ],
        [
            false,
            { error: 'live_too_many_cards', limit: 20, count: 23 },
            { refusal: { code: 'live_too_many_cards', limit: 20, count: 23 } },
        ],
        [false, { error: 'live_unavailable' }, { refusal: { code: 'live_unavailable' } }],
        [false, { error: 'guest_limit' }, { refusal: { code: 'guest_limit' } }],
        // What a second try can outlive, and every answer outside the contract.
        [false, { error: 'live_check_failed' }, { refusal: { code: 'failed' } }],
        [false, { error: 'unauthorized' }, { refusal: { code: 'failed' } }],
        [false, { error: 'live_cards_blocked', cards: [] }, { refusal: { code: 'failed' } }],
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

test('a snapshot link is ready as soon as the share exists, and asks for no refresh', async () => {
    const { open, requests, created } = site({ id: 'Snap0001', cards: CARDS });

    assert.deepEqual(await open('canvas', 'snapshot'), [
        { status: 'ready', id: 'Snap0001', mode: 'snapshot', unchecked: 0 },
    ]);
    assert.deepEqual(created, [['canvas', undefined, 'snapshot']]);
    assert.deepEqual(requests, []);
});

test('a live link is shown once every card has answered the refresh route', async () => {
    const { open, requests } = site(
        { id: 'Live0001', cards: CARDS },
        {
            cmp_a: [{ body: READY }],
            cmp_b: [{ body: { status: 'pending', retry_after_s: 2 } }, { body: READY }],
            cmp_c: [{ body: READY }],
        },
    );
    const reported = await open('canvas', 'live');

    // Until the last card settles the link is `checking`, which has no URL
    // to copy.
    assert.deepEqual(
        reported.map((link) => (link.status === 'checking' ? link.checked : link.status)),
        [0, 1, 2, 3, 'ready'],
    );
    assert.deepEqual(reported.at(-1), {
        status: 'ready',
        id: 'Live0001',
        mode: 'live',
        unchecked: 0,
    });
    assert.deepEqual(
        requests.toSorted(),
        [
            'POST /api/share/Live0001/cards/cmp_a/refresh',
            'POST /api/share/Live0001/cards/cmp_b/refresh',
            'POST /api/share/Live0001/cards/cmp_b/refresh',
            'POST /api/share/Live0001/cards/cmp_c/refresh',
        ].toSorted(),
    );
});

test('a card that can never refresh withdraws the live link: named, deleted, never ready', async () => {
    const { open, requests } = site(
        { id: 'Live0002', cards: CARDS },
        {
            cmp_a: [{ body: READY }],
            cmp_b: [{ body: refused('recipe_missing') }],
            cmp_c: [{ status: 404, body: { error: 'not_found' } }],
        },
    );
    const reported = await open('canvas', 'live');

    assert.deepEqual(reported.at(-1), {
        status: 'withdrawn',
        withdrawal: { reason: 'cards', cards: [CARDS[1], CARDS[2]] },
    });
    assert.equal(
        reported.some((link) => link.status === 'ready'),
        false,
    );
    // The delete follows the last refresh, so no live share is left behind.
    assert.equal(requests.at(-1), 'DELETE /api/share/Live0002');
});

test('a failure that asking again can fix leaves the live link standing', async () => {
    const { open, requests } = site(
        { id: 'Live0003', cards: CARDS },
        {
            cmp_a: [{ body: READY }],
            cmp_b: [{ body: refused('backend_unreachable') }],
            cmp_c: [{ body: { ...refused('service_unavailable'), retryable: true } }],
        },
    );

    assert.deepEqual((await open('canvas', 'live')).at(-1), {
        status: 'ready',
        id: 'Live0003',
        mode: 'live',
        unchecked: 2,
    });
    assert.equal(
        requests.some((request) => request.startsWith('DELETE')),
        false,
    );
});

test('a dfo-apis refusal that says it is retryable leaves the link standing; the same code without it names the card', async () => {
    for (const [retryable, expected] of [
        [true, { status: 'ready', id: 'Live0007', mode: 'live', unchecked: 1 }],
        [false, { status: 'withdrawn', withdrawal: { reason: 'cards', cards: CARDS.slice(0, 1) } }],
    ] as const) {
        const { open } = site(
            { id: 'Live0007', cards: CARDS.slice(0, 1) },
            {
                cmp_a: [
                    {
                        body: {
                            ...refused('release_mismatch'),
                            ...(retryable ? { retryable } : {}),
                        },
                    },
                ],
            },
        );

        assert.deepEqual((await open('card', 'live', 'cmp_a')).at(-1), expected, `${retryable}`);
    }
});

test('a site that cannot refresh any card withdraws the live link without blaming a card', async () => {
    const { open, requests } = site(
        { id: 'Live0004', cards: CARDS.slice(0, 1) },
        { cmp_a: [{ body: refused('refresh_not_permitted') }] },
    );

    assert.deepEqual((await open('card', 'live', 'cmp_a')).at(-1), {
        status: 'withdrawn',
        withdrawal: { reason: 'unavailable' },
    });
    assert.equal(requests.at(-1), 'DELETE /api/share/Live0004');
});

test('dfo-ai’s refusals decide the link: a transient one stands, a permanent one names the card, an unset credential withdraws it', async () => {
    for (const code of Object.keys(AI_REFUSALS)) {
        const { open, requests } = site(
            { id: 'Live0006', cards: CARDS.slice(0, 1) },
            { cmp_a: [{ body: refused(code) }] },
        );
        const last = (await open('card', 'live', 'cmp_a')).at(-1);
        const expected = {
            transient: { status: 'ready', id: 'Live0006', mode: 'live', unchecked: 1 },
            permanent: {
                status: 'withdrawn',
                withdrawal: { reason: 'cards', cards: CARDS.slice(0, 1) },
            },
            switched_off: { status: 'withdrawn', withdrawal: { reason: 'unavailable' } },
        }[liveFailureKind({ code })];

        assert.deepEqual(last, expected, code);
        assert.equal(
            requests.some((request) => request.startsWith('DELETE')),
            expected.status === 'withdrawn',
            code,
        );
    }

    // The three classes, one code each, so the loop above cannot pass by
    // putting every code in one class.
    assert.deepEqual(
        ['upstream_unavailable', 'recipe_missing', 'unauthorized'].map((code) =>
            liveFailureKind({ code }),
        ),
        ['transient', 'permanent', 'switched_off'],
    );
});

test('a share the site refuses to make is withdrawn, failed or limited, with nothing to refresh or delete', async () => {
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
        [{ refusal: { code: 'guest_limit' } }, { status: 'limited' }],
    ];

    for (const [mint, expected] of rows) {
        const { open, requests } = site(mint);

        assert.deepEqual(await open('canvas', 'live'), [expected]);
        assert.deepEqual(requests, []);
    }
});

test('a live share with no data card is ready at once', async () => {
    const { open, requests } = site({ id: 'Live0005', cards: [] });

    assert.deepEqual(await open('canvas', 'live'), [
        { status: 'ready', id: 'Live0005', mode: 'live', unchecked: 0 },
    ]);
    assert.deepEqual(requests, []);
});

test('the withdrawal sentence names every card in the way, and the limit with the count', () => {
    const text = withdrawalText({ reason: 'cards', cards: CARDS.slice(0, 2) }, false);

    assert.ok(text.includes('"Aid to Ghana"') && text.includes('"Debt service"'));
    assert.equal(text.includes('Remittances'), false);

    const limit = withdrawalText({ reason: 'limit', limit: 20, count: 23 }, false);

    assert.ok(limit.includes('20') && limit.includes('23'));
});

test("a live link is made a snapshot through the owner's PATCH", async () => {
    const { requests, bodies } = site({ refusal: { code: 'failed' } });
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
