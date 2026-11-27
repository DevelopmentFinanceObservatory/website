import assert from 'node:assert/strict';
import test from 'node:test';

import { isSlugTakenRefusal, isWithdrawnRefusal, publishRefusalText } from '../client.ts';

const CARDS = [
    { id: 'w1', title: 'Health ODA' },
    { id: 'w2', title: 'Debt service' },
];
const DETAIL = 'The detail the route sent.';

const refusal = (code: string, extra: Record<string, unknown> = {}) => ({
    type: 'about:blank',
    code,
    detail: DETAIL,
    retryable: false,
    ...extra,
});

test('publishRefusalText words each share refusal apart from the route detail', () => {
    const cap = publishRefusalText(
        refusal('live_too_many_cards', { limit: 12, count: 15 }),
        DETAIL,
        CARDS,
        false,
    );
    const blocked = publishRefusalText(
        refusal('live_cards_blocked', { cards: [{ id: 'w2', reason: 'missing_ref' }] }),
        DETAIL,
        CARDS,
        false,
    );

    assert.match(cap, /12/);
    assert.match(cap, /15/);
    assert.match(blocked, /Debt service/);
    assert.doesNotMatch(blocked, /Health ODA/);
    assert.notEqual(cap, blocked);
    assert.equal(isWithdrawnRefusal(refusal('artifact_withdrawn')), true);
    assert.equal(isWithdrawnRefusal(refusal('share_limit')), false);
    assert.equal(isSlugTakenRefusal(refusal('slug_taken')), true);
    assert.equal(isSlugTakenRefusal(refusal('artifact_withdrawn')), false);

    for (const code of [
        'share_limit',
        'share_refused',
        'payload_too_large',
        'artifact_withdrawn',
        'slug_taken',
    ]) {
        assert.notEqual(publishRefusalText(refusal(code), DETAIL, CARDS, false), DETAIL, code);
    }
});

test('publishRefusalText shows the route detail for any other refusal', () => {
    for (const problem of [
        refusal('request_invalid', { pointer: '/title' }),
        refusal('transient_unavailable', { retryable: true }),
        // A live refusal missing its figures reads as an unknown one.
        refusal('live_too_many_cards'),
        null,
    ]) {
        assert.equal(publishRefusalText(problem, DETAIL, CARDS, false), DETAIL);
    }
});
