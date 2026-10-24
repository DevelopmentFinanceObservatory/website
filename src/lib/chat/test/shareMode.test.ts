/**
 * `shareMode.ts`: how the nullable `share.mode` column reads for a Studio
 * share and for a search share, and what `POST /api/share` accepts as a
 * Studio share request.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { fitsProps } from '../../events/limits.ts';
import {
    isLiveStudioShare,
    readStudioShareRequest,
    searchShareMode,
    shareCreateProps,
} from '../shareMode.ts';

const conversation = { id: 'conv-1', title: 'Aid to Kenya', widgets: [] };

test('isLiveStudioShare: a Studio share with no stored mode is a snapshot', () => {
    for (const kind of ['canvas', 'card', 'conversation']) {
        assert.equal(isLiveStudioShare({ kind, mode: null }), false, kind);
    }
});

test('isLiveStudioShare: only a canvas or a card stored as live is live', () => {
    const readings = [
        ['canvas', 'live', true],
        ['card', 'live', true],
        ['canvas', 'snapshot', false],
        ['card', 'snapshot', false],
        ['conversation', 'live', false],
        ['search', 'live', false],
        ['search', null, false],
    ] as const;

    for (const [kind, mode, live] of readings) {
        assert.equal(isLiveStudioShare({ kind, mode }), live, `${kind} ${mode}`);
    }
});

test('searchShareMode: a search share with no stored mode is live', () => {
    assert.equal(searchShareMode(null), 'live');
    assert.equal(searchShareMode('live'), 'live');
    assert.equal(searchShareMode('snapshot'), 'snapshot');
});

test('readStudioShareRequest: a canvas or a card takes either mode', () => {
    for (const mode of ['live', 'snapshot'] as const) {
        assert.deepEqual(readStudioShareRequest({ kind: 'canvas', mode, conversation }), {
            kind: 'canvas',
            mode,
            saved: conversation,
            cardId: undefined,
        });
        assert.deepEqual(
            readStudioShareRequest({ kind: 'card', cardId: 'cmp_a', mode, conversation }),
            { kind: 'card', mode, saved: conversation, cardId: 'cmp_a' },
        );
    }
});

test('readStudioShareRequest: a request that names no mode asks for a snapshot', () => {
    for (const kind of ['conversation', 'canvas', 'card']) {
        const read = readStudioShareRequest({ kind, cardId: 'cmp_a', conversation });

        assert.equal('mode' in read && read.mode, 'snapshot', kind);
    }
});

// The refusal a request came to: its status and problem members.
const refusalOf = async (read: unknown) => {
    assert.ok(read instanceof Response, 'a refusal is a problem document');
    assert.equal(read.headers.get('content-type'), 'application/problem+json');

    const { status, code, pointer, retryable } = await read.json();

    return { status, code, pointer, retryable };
};

test('readStudioShareRequest: a live conversation share is refused', async () => {
    assert.deepEqual(
        await refusalOf(
            readStudioShareRequest({ kind: 'conversation', mode: 'live', conversation }),
        ),
        { status: 400, code: 'live_unsupported_kind', pointer: undefined, retryable: false },
    );
    assert.deepEqual(
        readStudioShareRequest({ kind: 'conversation', mode: 'snapshot', conversation }),
        { kind: 'conversation', mode: 'snapshot', saved: conversation, cardId: undefined },
    );
});

test('readStudioShareRequest: an unknown mode is refused, pointing at the mode', async () => {
    for (const mode of ['frozen', '', 1, true, ['live'], { mode: 'live' }]) {
        assert.deepEqual(
            await refusalOf(readStudioShareRequest({ kind: 'canvas', mode, conversation })),
            { status: 400, code: 'request_invalid', pointer: '/mode', retryable: false },
        );
    }
});

test('readStudioShareRequest: a request without a kind, a conversation, or a card id is refused', async () => {
    const refused = [
        null,
        {},
        { kind: 'search', conversation },
        { kind: 'poster', conversation },
        { kind: 'canvas' },
        { kind: 'canvas', conversation: { id: 'conv-1' } },
        { kind: 'canvas', conversation: { widgets: [] } },
        { kind: 'card', conversation },
    ];

    for (const body of refused) {
        assert.deepEqual(await refusalOf(readStudioShareRequest(body)), {
            status: 400,
            code: 'request_invalid',
            pointer: undefined,
            retryable: false,
        });
    }
});

test('shareCreateProps: the share.create event carries the kind and the mode within the props limit', () => {
    for (const [kind, mode] of [
        ['card', 'live'],
        ['search', 'snapshot'],
    ] as const) {
        const props = shareCreateProps({ id: 'abcd1234', kind, mode });

        assert.deepEqual(props, { shareId: 'abcd1234', kind, mode });
        assert.ok(fitsProps(props));
    }
});
