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

test('readStudioShareRequest: a live conversation share is refused', () => {
    assert.deepEqual(readStudioShareRequest({ kind: 'conversation', mode: 'live', conversation }), {
        error: 'live_unsupported_kind',
    });
    assert.deepEqual(
        readStudioShareRequest({ kind: 'conversation', mode: 'snapshot', conversation }),
        { kind: 'conversation', mode: 'snapshot', saved: conversation, cardId: undefined },
    );
});

test('readStudioShareRequest: an unknown mode is refused', () => {
    for (const mode of ['frozen', '', 1, true, ['live'], { mode: 'live' }]) {
        assert.deepEqual(readStudioShareRequest({ kind: 'canvas', mode, conversation }), {
            error: 'invalid_mode',
        });
    }
});

test('readStudioShareRequest: a request without a kind, a conversation, or a card id is refused', () => {
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
        assert.deepEqual(readStudioShareRequest(body), { error: 'bad_request' });
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
