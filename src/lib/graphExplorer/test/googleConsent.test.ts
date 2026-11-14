/**
 * `googleConsent.ts`: the consent trip as the return address records it,
 * and the Create Google Sheet control's state for each answer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    answerState,
    consentReturns,
    shownCreateState,
    takeConsentTrip,
    type ConsentTrip,
    type CreateState,
} from '../googleConsent.ts';
import type { SheetsAnswer } from '../googleSheet.ts';

const tripOf = (href: string) => takeConsentTrip(new URL(href, 'https://site.example').search).trip;

for (const [query, trip, rest] of [
    ['', 'none', ''],
    ['?class=X', 'none', '?class=X'],
    ['?class=X&google=1', 'granted', '?class=X'],
    ['?google=1', 'granted', ''],
    ['?class=X&error=access_denied', 'refused', '?class=X'],
    ['?class=X&google=1&error=access_denied', 'refused', '?class=X'],
] as const) {
    test(`a return to "${query}" records trip ${trip} and leaves "${rest}"`, () => {
        assert.deepEqual(takeConsentTrip(query), { trip, query: rest });
    });
}

test('the cleaned query records no trip', () => {
    const { query } = takeConsentTrip('?class=X&google=1');
    assert.equal(takeConsentTrip(query).trip, 'none');
});

test('only the success address carries the mark, and both drop the last trip', () => {
    const { callbackURL, errorCallbackURL } = consentReturns(
        'https://site.example/graph-explorer/new-sheet?class=X&google=1&error=access_denied',
    );
    assert.equal(callbackURL, '/graph-explorer/new-sheet?class=X&google=1');
    assert.equal(errorCallbackURL, '/graph-explorer/new-sheet?class=X');
    assert.equal(tripOf(errorCallbackURL), 'none');
});

const created: CreateState = { kind: 'created', url: 'u', dropdownsFailed: false };

for (const [name, record, trip, expected] of [
    ['no record opens idle', null, 'none', 'idle'],
    ['no record after a refused trip offers consent', null, 'refused', 'needs_google'],
    ['no record after a granted trip opens idle', null, 'granted', 'idle'],
    [
        'a record for the current draft is shown',
        { query: '?class=X', state: created },
        'none',
        'created',
    ],
    [
        'a working record for the current draft is shown',
        { query: '?class=X', state: { kind: 'working' } },
        'none',
        'working',
    ],
    [
        'a request in flight for another draft is shown',
        { query: '?class=Y', state: { kind: 'working' } },
        'none',
        'working',
    ],
    [
        'a record for another draft is not shown',
        { query: '?class=Y', state: created },
        'none',
        'idle',
    ],
    [
        'a record for another draft after a refused trip',
        { query: '?class=Y', state: created },
        'refused',
        'needs_google',
    ],
] as [string, { query: string; state: CreateState } | null, ConsentTrip, string][]) {
    test(`shown state: ${name}`, () => {
        assert.equal(shownCreateState(record, '?class=X', trip).kind, expected);
    });
}

const refusal = (code: string, reason?: string) =>
    ({ ok: false, code, reason, message: 'm' }) as SheetsAnswer;

for (const [answer, now, expected] of [
    [{ ok: true, url: 'u', dropdowns: 'added' }, 'none', 'created'],
    [null, 'none', 'failed'],
    [refusal('google_access_needed', 'scope_missing'), 'none', 'needs_google'],
    [refusal('google_access_needed', 'scope_missing'), 'refused', 'needs_google'],
    [refusal('google_access_needed', 'token_expired'), 'granted', 'failed'],
    [refusal('google_renewal_failed'), 'none', 'renewal_failed'],
    [refusal('google_renewal_failed'), 'granted', 'renewal_failed'],
    [refusal('google_failed'), 'none', 'failed'],
    [refusal('auth_failed'), 'none', 'failed'],
    [refusal('signed_out'), 'none', 'failed'],
] as [SheetsAnswer | null, ConsentTrip, string][]) {
    test(`${answer === null ? 'no answer' : answer.ok ? 'a sheet' : answer.code} after trip ${now} is ${expected}`, () => {
        assert.equal(answerState(answer, now).kind, expected);
    });
}

test('a created sheet carries its address and whether its dropdowns failed', () => {
    assert.deepEqual(answerState({ ok: true, url: 'u', dropdowns: 'failed' }, 'none'), {
        kind: 'created',
        url: 'u',
        dropdownsFailed: true,
    });
});
