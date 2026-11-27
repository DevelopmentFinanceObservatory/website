import assert from 'node:assert/strict';
import test from 'node:test';

import {
    evergreenFailureText,
    isArtifactChangedRefusal,
    isSlugTakenRefusal,
    isWithdrawnRefusal,
    publishRefusalText,
    readEvergreenAnswer,
    readEvergreenWarnings,
    sameField,
} from '../client.ts';

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

test('readEvergreenAnswer narrows a not_evergreen refusal and drops unreadable entries', () => {
    const entry = {
        pointer: '/content',
        start: 3,
        end: 20,
        quote: 'Aid fell 4%.',
        kind: 'trend',
        reason: 'A refresh could change it.',
    };
    const answer = readEvergreenAnswer(
        refusal('not_evergreen', {
            pointer: '/content',
            errors: [entry, { ...entry, pointer: '/slug' }, { ...entry, start: '3' }, null],
        }),
    );

    assert.deepEqual(answer, {
        code: 'not_evergreen',
        fix: DETAIL,
        warnings: [],
        errors: [
            {
                field: 'content',
                start: 3,
                end: 20,
                quote: entry.quote,
                kind: 'trend',
                reason: entry.reason,
            },
        ],
    });
    assert.equal(readEvergreenAnswer(refusal('not_evergreen', { errors: [] })), null);
    assert.deepEqual(
        readEvergreenAnswer(
            refusal('not_evergreen', {
                errors: [entry],
                warnings: [{ ...entry, pointer: '/title', kind: 'change' }, 7],
            }),
        ),
        {
            code: 'not_evergreen',
            fix: DETAIL,
            errors: [
                {
                    field: 'content',
                    start: 3,
                    end: 20,
                    quote: entry.quote,
                    kind: 'trend',
                    reason: entry.reason,
                },
            ],
            warnings: [{ field: 'title', start: 3, end: 20, quote: entry.quote, kind: 'change' }],
        },
    );
    assert.equal(readEvergreenAnswer(refusal('slug_taken')), null);
    assert.equal(readEvergreenAnswer(null), null);
});

test('evergreen check failures read apart from each other and from a refusal', () => {
    const unavailable = readEvergreenAnswer(refusal('evergreen_check_unavailable'));
    const refused = readEvergreenAnswer(refusal('evergreen_check_refused'));

    assert.equal(unavailable?.code, 'evergreen_check_unavailable');
    assert.equal(refused?.code, 'evergreen_check_refused');
    assert.ok(unavailable && refused);
    assert.notEqual(evergreenFailureText(unavailable), evergreenFailureText(refused));
    assert.ok(evergreenFailureText(unavailable));
});

test('evergreen_too_long reads from the pointer and detail alone', () => {
    assert.deepEqual(readEvergreenAnswer(refusal('evergreen_too_long', { pointer: '/content' })), {
        code: 'evergreen_too_long',
        field: 'content',
        detail: DETAIL,
    });
    assert.equal(readEvergreenAnswer(refusal('evergreen_too_long', { pointer: '/slug' })), null);
    assert.equal(readEvergreenAnswer(refusal('evergreen_too_long')), null);
});

test('a refusal applies to a field only while it holds the submitted value', () => {
    const sent = {
        title: 'Aid doubled.',
        description: 'd',
        contentTitle: null,
        content: null,
        topics: [],
    };

    assert.equal(sameField(sent, { ...sent }, 'title'), true);
    assert.equal(sameField(sent, { ...sent, title: 'Aid, by year' }, 'title'), false);
    assert.equal(sameField(sent, { ...sent, title: 'Aid, by year' }, 'description'), true);
    assert.equal(sameField(sent, { ...sent, content: '' }, 'content'), true);
});

test('isArtifactChangedRefusal reads the 409 code', () => {
    assert.equal(isArtifactChangedRefusal(refusal('artifact_changed')), true);
    assert.equal(isArtifactChangedRefusal(refusal('slug_taken')), false);
    assert.equal(isArtifactChangedRefusal(null), false);
});

test('readEvergreenWarnings narrows the flagged sentences and drops unreadable ones', () => {
    const entry = { pointer: '/description', start: 0, end: 9, quote: 'Aid rose.', kind: 'change' };

    assert.deepEqual(
        readEvergreenWarnings({
            slug: 'a',
            warnings: [entry, { ...entry, pointer: '/slug' }, { ...entry, quote: 4 }, 'x'],
        }),
        [{ field: 'description', start: 0, end: 9, quote: 'Aid rose.', kind: 'change' }],
    );
    assert.deepEqual(readEvergreenWarnings({ slug: 'a' }), []);
    assert.deepEqual(readEvergreenWarnings(null), []);
});
